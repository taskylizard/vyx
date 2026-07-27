import { Client, Intents } from 'oceanic.js'
import { match } from 'ts-pattern'
import type { Logger } from 'tracix'
import { loadKanikouEnv, type KanikouEnv } from '../config/env.ts'
import { createKanikouLogger } from '../logging.ts'
import { slashCommands } from '../commands/index.ts'
import { createKanikouModel } from '../llm/client.ts'
import { MintlifyMcpToolProvider, OperationsToolProvider } from '../llm/mintlify-mcp.ts'
import { KanikouResponder } from '../llm/responder.ts'
import { MarkdownMemoryStore, type MemoryStore } from '../memory/markdown-memory.ts'
import {
  createKanikouTools,
  createProjectSeleneTools,
  PROJECT_SELENE_INSTRUCTIONS
} from '../llm/tools/index.ts'
import { startAxiomObservability } from '../observability/axiom.ts'
import { componentIds, jumbleComponents } from '../jumble/components.ts'
import { editJumbleMessage, renderJumble } from '../jumble/discord.ts'
import { LastFmClient, MissingLastFmProvider } from '../jumble/lastfm.ts'
import { DiscogsClient } from '../jumble/discogs.ts'
import { DeezerClient } from '../jumble/deezer.ts'
import { JumbleMetadataCache } from '../jumble/metadata-cache.ts'
import { MusicBrainzClient } from '../jumble/musicbrainz.ts'
import { JumbleImageRenderer } from '../jumble/renderer.ts'
import { JumbleRepository } from '../jumble/repository.ts'
import { JumbleService } from '../jumble/service.ts'
import type { JumbleTimingSink } from '../jumble/timing.ts'
import { createKanikouDatabase, type KanikouDatabase } from '../database/database.ts'
import { GuildSettingsStore } from '../database/guild-settings.ts'
import { handleMessageCreate } from './messages.ts'
import { rosepack } from './rosepack.ts'
import type { BotContext } from './context.ts'

export interface KanikouApp {
  client: Client
  start(): Promise<void>
  stop(): Promise<void>
}

interface JumbleInfrastructure {
  jumble: JumbleService
  jumbleRenderer: JumbleImageRenderer
  jumbleMetadataCache: JumbleMetadataCache
}

function createJumbleInfrastructure(
  config: KanikouEnv,
  database: KanikouDatabase,
  client: Client,
  logger: Logger
): JumbleInfrastructure {
  const jumbleMetadataCache = new JumbleMetadataCache(database.db, {
    onError: (error) => logger.warn('jumble metadata cache error', error)
  })
  const onTiming: JumbleTimingSink = (event) => {
    logger.info(`jumble timing ${JSON.stringify(event)}`)
  }
  const musicBrainz = new MusicBrainzClient({
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('MusicBrainz enrichment error', error)
  })
  const discogs = new DiscogsClient({
    token: config.DISCOGS_TOKEN,
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('Discogs enrichment error', error)
  })
  const deezer = new DeezerClient({
    cache: jumbleMetadataCache,
    onError: (error) => logger.warn('Deezer enrichment error', error)
  })
  const jumbleRenderer = new JumbleImageRenderer({ onTiming })
  const jumbleProvider = match(config.LASTFM_API_KEY)
    .with(undefined, () => new MissingLastFmProvider())
    .otherwise((apiKey) => new LastFmClient({ apiKey, musicBrainz, discogs, deezer, onTiming }))
  const jumble = new JumbleService(new JumbleRepository(database.db), jumbleProvider, {
    onTiming,
    onExpired: async (state) => {
      if (state.session.messageId === null) return
      const rendered = await renderJumble(
        state,
        jumbleRenderer,
        componentIds(state.session.id),
        'expired'
      )
      if (rendered.imageError !== undefined) {
        logger.warn('expired jumble image could not be rendered', rendered.imageError)
      }
      try {
        await editJumbleMessage(client, state.session.channelId, state.session.messageId, rendered)
      } catch (error) {
        logger.warn('expired jumble message could not be updated', error)
      }
    }
  })
  return { jumble, jumbleRenderer, jumbleMetadataCache }
}

interface ReadySetupDeps {
  database: KanikouDatabase
  jumbleMetadataCache: JumbleMetadataCache
  jumble: JumbleService
  config: KanikouEnv
  memory: MemoryStore
  moduleStore: GuildSettingsStore
  responder: KanikouResponder
  jumbleRenderer: JumbleImageRenderer
}

async function performReadySetup(
  client: Client,
  registry: ReturnType<typeof rosepack.createRegistry>,
  logger: Logger,
  deps: ReadySetupDeps
): Promise<BotContext> {
  await deps.database.initialize()
  await deps.jumbleMetadataCache.prune()
  await deps.jumble.restoreActive()
  const context: BotContext = {
    applicationID: client.application.id,
    botUserID: client.user.id,
    client,
    env: deps.config,
    logger,
    memory: deps.memory,
    moduleStore: deps.moduleStore,
    responder: deps.responder,
    jumble: deps.jumble,
    jumbleRenderer: deps.jumbleRenderer
  }
  logger.info(`kanikou connected as ${client.user.tag}`)
  const registered = await registry.registerGlobal({
    applicationID: context.applicationID,
    client: context.client
  })
  logger.info(`registered ${registered.length} global slash command(s)`)
  try {
    const synchronized = await registry.modules.syncAll({
      app: context,
      applicationID: context.applicationID,
      client: context.client,
      guildIDs: context.client.guilds.keys()
    })
    logger.info(`synchronized modules for ${synchronized.size} guild(s)`)
  } catch (error) {
    logger.warn('guild module synchronization failed', error)
  }
  return context
}

export function createKanikouApp(config: KanikouEnv = loadKanikouEnv()): KanikouApp {
  const registry = rosepack.createRegistry({ components: jumbleComponents, slashCommands })
  const logger = createKanikouLogger(config.LOG_LEVEL)
  const observability = startAxiomObservability(config)
  const memory = new MarkdownMemoryStore()
  const client = new Client({
    auth: `Bot ${config.KANIKOU_DISCORD_TOKEN}`,
    gateway: {
      intents:
        Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.DIRECT_MESSAGES | Intents.MESSAGE_CONTENT
    }
  })
  const mintlifyMcp =
    config.MINTLIFY_MCP_OAUTH_FILE === undefined
      ? undefined
      : new MintlifyMcpToolProvider({
          oauthFile: config.MINTLIFY_MCP_OAUTH_FILE,
          onError: (error) => logger.error('Mintlify MCP error', error)
        })
  const responder = new KanikouResponder(
    createKanikouModel(config),
    createKanikouTools({
      parallel:
        config.PARALLEL_API_KEY === undefined ? undefined : { apiKey: config.PARALLEL_API_KEY },
      supadata:
        config.SUPADATA_API_KEY === undefined ? undefined : { apiKey: config.SUPADATA_API_KEY }
    }),
    new OperationsToolProvider({
      instructions: PROJECT_SELENE_INSTRUCTIONS,
      provider: mintlifyMcp,
      tools: createProjectSeleneTools({ token: config.GITHUB_TOKEN })
    })
  )
  const database = createKanikouDatabase({
    url: config.KANIKOU_DATABASE_URL,
    authToken: config.LIBSQL_AUTH_TOKEN
  })
  const moduleStore = new GuildSettingsStore(database.db)
  const { jumble, jumbleRenderer, jumbleMetadataCache } = createJumbleInfrastructure(
    config,
    database,
    client,
    logger
  )

  let context: BotContext | undefined

  client.once('ready', () => {
    runTask(logger, async () => {
      context = await performReadySetup(client, registry, logger, {
        database,
        jumbleMetadataCache,
        jumble,
        config,
        memory,
        moduleStore,
        responder,
        jumbleRenderer
      })
    })
  })

  client.on('interactionCreate', (interaction) => {
    runTask(logger, async () => {
      if (context !== undefined) await registry.dispatch({ app: context, interaction })
    })
  })

  client.on('messageCreate', (message) => {
    runTask(logger, async () => {
      if (context !== undefined) await handleMessageCreate(context, message)
    })
  })

  client.on('error', (info) => logger.error(info))
  client.on('warn', (info) => logger.warn(info))

  return {
    client,
    async start() {
      await client.connect()
    },
    async stop() {
      client.disconnect(false)
      jumble.stop()
      database.close()
      const results = await Promise.allSettled([mintlifyMcp?.close(), observability.shutdown()])
      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error('failed to stop bot dependency', result.reason)
        }
      }
    }
  }
}

export async function startKanikouBot(config: KanikouEnv = loadKanikouEnv()): Promise<KanikouApp> {
  const app = createKanikouApp(config)
  await app.start()
  return app
}

function runTask(logger: ReturnType<typeof createKanikouLogger>, task: () => Promise<void>): void {
  void task().catch((error: unknown) => {
    logger.error('async bot task failed', error)
  })
}
