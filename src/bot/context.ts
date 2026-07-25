import type { Client } from 'oceanic.js'
import type { Logger } from 'tracix'
import type { KanikouEnv } from '../config/env.ts'
import type { KanikouResponder } from '../llm/responder.ts'
import type { MemoryStore } from '../memory/markdown-memory.ts'
import type { JumbleService } from '../jumble/service.ts'
import type { JumbleImageRenderer } from '../jumble/renderer.ts'
import type { GuildSettingsStore } from '../database/guild-settings.ts'

export interface BotContext {
  applicationID: string
  botUserID: string
  client: Client
  env: KanikouEnv
  logger: Logger
  memory: MemoryStore
  moduleStore: GuildSettingsStore
  responder: KanikouResponder
  jumble: JumbleService
  jumbleRenderer: JumbleImageRenderer
}
