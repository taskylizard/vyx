import { Client, Intents } from 'oceanic.js'
import { loadKanikouEnv, type KanikouEnv } from '../config/env.ts'
import { createKanikouLogger } from '../logging.ts'
import { slashCommands } from '../commands/index.ts'
import { createKanikouModel } from '../llm/client.ts'
import { MintlifyMcpToolProvider, OperationsToolProvider } from '../llm/mintlify-mcp.ts'
import { KanikouResponder } from '../llm/responder.ts'
import { MarkdownMemoryStore } from '../memory/markdown-memory.ts'
import {
  createKanikouTools,
  createProjectSeleneTools,
  PROJECT_SELENE_INSTRUCTIONS
} from '../llm/tools/index.ts'
import { startAxiomObservability } from '../observability/axiom.ts'
import { handleMessageCreate } from './messages.ts'
import { rosepack } from './rosepack.ts'
import type { BotContext } from './context.ts'

export interface KanikouApp {
  client: Client
  start(): Promise<void>
  stop(): Promise<void>
}

export function createKanikouApp(config: KanikouEnv = loadKanikouEnv()): KanikouApp {
  const registry = rosepack.createRegistry(slashCommands)
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
        config.PARALLEL_API_KEY === undefined
          ? undefined
          : {
              apiKey: config.PARALLEL_API_KEY
            },
      supadata:
        config.SUPADATA_API_KEY === undefined
          ? undefined
          : {
              apiKey: config.SUPADATA_API_KEY
            }
    }),
    new OperationsToolProvider({
      instructions: PROJECT_SELENE_INSTRUCTIONS,
      provider: mintlifyMcp,
      tools: createProjectSeleneTools({ token: config.GITHUB_TOKEN })
    })
  )

  let context: BotContext | undefined

  client.once('ready', () => {
    context = {
      applicationID: client.application.id,
      botUserID: client.user.id,
      client,
      env: config,
      logger,
      memory,
      responder
    }
    logger.info(`kanikou connected as ${client.user.tag}`)
    runTask(logger, async () => {
      const activeContext = context
      if (activeContext !== undefined) {
        const registered = await registry.registerGlobal({
          applicationID: activeContext.applicationID,
          client: activeContext.client
        })
        logger.info(`registered ${registered.length} global slash command(s)`)
      }
    })
  })

  client.on('interactionCreate', (interaction) => {
    runTask(logger, async () => {
      const activeContext = context
      if (activeContext !== undefined) {
        await registry.dispatch({ app: activeContext, interaction })
      }
    })
  })

  client.on('messageCreate', (message) => {
    runTask(logger, async () => {
      const activeContext = context
      if (activeContext !== undefined) {
        await handleMessageCreate(activeContext, message)
      }
    })
  })

  client.on('error', (info) => {
    logger.error(info)
  })

  client.on('warn', (info) => {
    logger.warn(info)
  })

  return {
    client,
    async start() {
      await client.connect()
    },
    async stop() {
      client.disconnect(false)
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
