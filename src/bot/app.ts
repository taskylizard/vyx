import { Client, Intents, InteractionTypes, type AnyInteractionGateway } from 'oceanic.js'
import { match } from 'ts-pattern'
import { loadKanikouEnv, type KanikouEnv } from '../config/env.ts'
import { slashCommands } from '../commands/index.ts'
import { createKanikouModel } from '../llm/client.ts'
import { MintlifyMcpToolProvider, OperationsToolProvider } from '../llm/mintlify-mcp.ts'
import { KanikouResponder } from '../llm/responder.ts'
import { CompositeToolProvider } from '../llm/scoped-tools.ts'
import { MarkdownMemoryStore, type MemoryStore } from '../memory/markdown-memory.ts'
import {
  createAiTools,
  createProjectSeleneTools,
  MemoryToolProvider,
  PROJECT_SELENE_INSTRUCTIONS
} from '../llm/tools/index.ts'
import { startKanikouObservability } from '../observability/axiom.ts'
import { createKanikouDatabase, type KanikouDatabase } from '../database/database.ts'
import { GuildSettingsStore } from '../database/guild-settings.ts'
import { handleMessageCreate } from './messages.ts'
import { rosepack } from './rosepack.ts'
import type { BotContext } from './context.ts'
import { type Jumble, createJumble } from '../jumble/index.ts'
import type { KanikouLogger, KanikouObservability } from '../observability/types.ts'
import { traceOperation } from '../observability/tracing.ts'
import { jumbleComponents } from '../jumble/components.ts'

export interface KanikouApp {
  client: Client
  start(): Promise<void>
  stop(): Promise<void>
}

interface ReadySetupDeps {
  database: KanikouDatabase
  jumble: Jumble
  config: KanikouEnv
  memory: MemoryStore
  moduleStore: GuildSettingsStore
  responder: KanikouResponder
}

async function performReadySetup(
  client: Client,
  registry: ReturnType<typeof rosepack.createRegistry>,
  logger: KanikouLogger,
  deps: ReadySetupDeps
): Promise<BotContext> {
  await traceOperation('database.initialize', { parent: 'active' }, async () =>
    deps.database.initialize()
  )
  await traceOperation('jumble.metadata_cache.prune', { parent: 'active' }, async () =>
    deps.jumble.metadataCache.prune()
  )
  await traceOperation('jumble.restore_active', { parent: 'active' }, async () =>
    deps.jumble.service.restoreActive()
  )
  deps.jumble.service.startLibrarySweep()
  const context: BotContext = {
    applicationID: client.application.id,
    botUserID: client.user.id,
    client,
    env: deps.config,
    logger,
    memory: deps.memory,
    moduleStore: deps.moduleStore,
    responder: deps.responder,
    jumble: deps.jumble
  }
  logger.info('kanikou connected', { botUserId: client.user.id, botUserTag: client.user.tag })
  const registered = await traceOperation(
    'discord.commands.register_global',
    { parent: 'active' },
    async () =>
      registry.registerGlobal({
        applicationID: context.applicationID,
        client: context.client
      })
  )
  logger.info('registered global slash commands', { commandCount: registered.length })
  try {
    const synchronized = await traceOperation(
      'discord.modules.synchronize',
      { parent: 'active' },
      async () =>
        registry.modules.syncAll({
          app: context,
          applicationID: context.applicationID,
          client: context.client,
          guildIDs: context.client.guilds.keys()
        })
    )
    logger.info('synchronized guild modules', { guildCount: synchronized.size })
  } catch (error) {
    logger.warn('guild module synchronization failed', { error })
  }
  return context
}

function createBotDependencies(config: KanikouEnv, client: Client, logger: KanikouLogger) {
  const memory = new MarkdownMemoryStore()
  const mintlifyMcp =
    config.MINTLIFY_MCP_OAUTH_FILE === undefined
      ? undefined
      : new MintlifyMcpToolProvider({
          oauthFile: config.MINTLIFY_MCP_OAUTH_FILE,
          onError: (error) => logger.error('Mintlify MCP error', { error })
        })
  const responder = new KanikouResponder(
    createKanikouModel(config),
    createAiTools({
      parallel:
        config.PARALLEL_API_KEY === undefined ? undefined : { apiKey: config.PARALLEL_API_KEY },
      supadata:
        config.SUPADATA_API_KEY === undefined ? undefined : { apiKey: config.SUPADATA_API_KEY }
    }),
    new CompositeToolProvider([
      new MemoryToolProvider({ store: memory }),
      new OperationsToolProvider({
        instructions: PROJECT_SELENE_INSTRUCTIONS,
        provider: mintlifyMcp,
        tools: createProjectSeleneTools({ token: config.GITHUB_TOKEN })
      })
    ])
  )
  const database = createKanikouDatabase({
    url: config.KANIKOU_DATABASE_URL,
    authToken: config.LIBSQL_AUTH_TOKEN
  })
  const moduleStore = new GuildSettingsStore(database.db)
  const jumble = createJumble(config, database, client, logger)

  return { database, memory, mintlifyMcp, moduleStore, responder, jumble }
}

export function createKanikouApp(
  config: KanikouEnv = loadKanikouEnv(),
  observability: KanikouObservability = startKanikouObservability(config.observability)
): KanikouApp {
  const registry = rosepack.createRegistry({ components: jumbleComponents, slashCommands })
  const logger = observability.logger
  const client = new Client({
    auth: `Bot ${config.KANIKOU_DISCORD_TOKEN}`,
    gateway: {
      intents:
        Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.DIRECT_MESSAGES | Intents.MESSAGE_CONTENT
    }
  })
  const { database, jumble, memory, mintlifyMcp, moduleStore, responder } = createBotDependencies(
    config,
    client,
    logger
  )

  let context: BotContext | undefined

  client.once('ready', () => {
    runTask(observability, 'bot.ready_setup', {}, async () => {
      context = await performReadySetup(client, registry, logger, {
        database,
        jumble,
        config,
        memory,
        moduleStore,
        responder
      })
    })
  })

  client.on('interactionCreate', (interaction) => {
    runTask(
      observability,
      'discord.interaction.handle',
      interactionTraceAttributes(interaction),
      async () => {
        if (context !== undefined) await registry.dispatch({ app: context, interaction })
      }
    )
  })

  client.on('messageCreate', (message) => {
    runTask(
      observability,
      'discord.message.handle',
      {
        'discord.channel.id': message.channelID,
        'discord.guild.id': message.guildID ?? 'direct-message',
        'discord.message.author.id': message.author.id,
        'discord.message.id': message.id
      },
      async () => {
        if (context !== undefined) await handleMessageCreate(context, message)
      }
    )
  })

  client.on('error', (info) => logger.error('discord client error', { error: info }))
  client.on('warn', (info) => logger.warn('discord client warning', { warning: info }))

  return {
    client,
    async start() {
      await traceOperation('bot.connect', { parent: 'root' }, async () => client.connect())
    },
    async stop() {
      await traceOperation('bot.stop', { parent: 'root' }, async () => {
        client.disconnect(false)
        jumble.service.stop()
        await jumble.service.drain()
        database.close()
      })
      const results = await Promise.allSettled([mintlifyMcp?.close()])
      for (const result of results) {
        match(result)
          .with({ status: 'fulfilled' }, () => undefined)
          .with({ status: 'rejected' }, ({ reason }) =>
            logger.error('failed to stop bot dependency', { error: reason })
          )
          .exhaustive()
      }
      await observability.shutdown()
    }
  }
}

export async function startKanikouBot(
  config: KanikouEnv = loadKanikouEnv(),
  observability?: KanikouObservability
): Promise<KanikouApp> {
  const app = createKanikouApp(config, observability)
  await app.start()
  return app
}

function runTask(
  observability: KanikouObservability,
  operation: string,
  attributes: Readonly<Record<string, unknown>>,
  task: () => Promise<void>
): void {
  void traceOperation(operation, { attributes, parent: 'root' }, async () => {
    try {
      await task()
    } catch (error) {
      observability.logger.error('async bot task failed', { error, operation })
    }
  })
}

function interactionTraceAttributes(
  interaction: AnyInteractionGateway
): Readonly<Record<string, unknown>> {
  const common = {
    'discord.channel.id': interaction.channelID,
    'discord.guild.id': interaction.guildID ?? 'direct-message',
    'discord.interaction.id': interaction.id,
    'discord.interaction.type': interaction.type
  }
  const kind = match(interaction.type)
    .with(InteractionTypes.APPLICATION_COMMAND, () => 'command')
    .with(InteractionTypes.MESSAGE_COMPONENT, () => 'component')
    .with(InteractionTypes.MODAL_SUBMIT, () => 'modal')
    .with(InteractionTypes.APPLICATION_COMMAND_AUTOCOMPLETE, () => 'autocomplete')
    .otherwise(() => 'unknown')
  const route = ('name' in interaction.data ? interaction.data.name : interaction.data.customID)
    .split('/')
    .slice(0, 2)
    .join('/')

  return {
    ...common,
    'discord.interaction.kind': kind,
    'discord.interaction.route': route
  }
}
