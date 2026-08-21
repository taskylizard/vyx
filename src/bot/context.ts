import type { Client } from 'oceanic.js'
import type { KanikouEnv } from '../config/env.ts'
import type { ChimeWatcher } from '../chime/watcher.ts'
import type { KanikouResponder } from '../llm/responder.ts'
import type { MemoryStore } from '../memory/markdown-memory.ts'
import type { JumbleService } from '../jumble/service.ts'
import type { JumbleImageRenderer } from '../jumble/renderer.ts'
import type { GuildSettingsStore } from '../database/guild-settings.ts'
import type { KanikouLogger } from '../observability/types.ts'

export interface BotContext {
  applicationID: string
  botUserID: string
  chime: ChimeWatcher
  client: Client
  env: KanikouEnv
  logger: KanikouLogger
  memory: MemoryStore
  moduleStore: GuildSettingsStore
  responder: KanikouResponder
  jumble: JumbleService
  jumbleRenderer: JumbleImageRenderer
}
