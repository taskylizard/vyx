import type { Client } from 'oceanic.js'
import type { Logger } from 'tracix'
import type { KanikouEnv } from '../config/env.ts'
import type { KanikouResponder } from '../llm/responder.ts'
import type { MemoryStore } from '../memory/markdown-memory.ts'

export interface BotContext {
  applicationID: string
  botUserID: string
  client: Client
  env: KanikouEnv
  logger: Logger
  memory: MemoryStore
  responder: KanikouResponder
}
