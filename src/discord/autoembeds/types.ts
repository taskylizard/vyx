import type { CreateMessageClient, EditMessageClient } from '../client-types.ts'
import type { KanikouLogger } from '../../observability/types.ts'

export interface AutoembedContext {
  client: CreateMessageClient<unknown> & EditMessageClient<unknown>
  env: {
    FAUNA_URL?: string
  }
  logger: Pick<KanikouLogger, 'info' | 'warn'>
}

export interface AutoembedMessage {
  channelID: string
  content: string
  flags: number
  guildID: string | null
  id: string
}
