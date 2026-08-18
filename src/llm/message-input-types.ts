import type { MessageFetchClient } from '../discord/client-types.ts'
import type { MemoryStore } from '../memory/markdown-memory.ts'

export interface PromptAttachment {
  contentType?: string | null
  url: string
}

interface PromptEmbed {
  thumbnail?: {
    url?: string
  } | null
  type?: string
}

export interface PromptMessage {
  attachments: {
    toArray(): readonly PromptAttachment[]
  }
  author: {
    globalName: string | null
    id: string
    username: string
  }
  channelID: string
  content: string
  embeds: readonly PromptEmbed[]
  guildID: string | null
  member?: {
    displayName: string
  } | null
  messageReference?: {
    channelID?: string
    messageID?: string
  } | null
  referencedMessage?: PromptMessage | null
}

export interface MessagePromptContext {
  botUserID: string
  client: MessageFetchClient<PromptMessage>
  memory: Pick<MemoryStore, 'promptContext'>
}

export interface SlashPromptContext {
  memory: Pick<MemoryStore, 'promptContext'>
}

export interface SlashPromptInteraction {
  guildID: string | null
  member?: {
    displayName: string
  } | null
  user: {
    globalName: string | null
    id: string
    username: string
  }
}
