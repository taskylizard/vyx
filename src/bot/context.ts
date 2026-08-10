import type { Client } from 'oceanic.js'
import type { KanikouEnv } from '../config/env.ts'
import type { KanikouResponder } from '../llm/responder.ts'
import type { MemoryStore } from '../memory/markdown-memory.ts'
import type { GuildSettingsStore } from '../database/guild-settings.ts'
import type { KanikouLogger } from '../observability/types.ts'
import type { Jumble } from '../jumble/index.ts'

export interface BotContext {
  applicationID: string
  botUserID: string
  client: Client
  env: KanikouEnv
  logger: KanikouLogger
  memory: MemoryStore
  moduleStore: GuildSettingsStore
  responder: KanikouResponder
  jumble: Jumble
}
