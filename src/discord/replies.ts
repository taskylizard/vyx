import type { Client, EmbedOptions, Message } from 'oceanic.js'
import type { EditMessageClient } from './client-types.ts'
import { replyMessageReference, suppressAllMentions } from './message-options.ts'
import { safeCreateMessage, safeEditMessage } from './safe-actions.ts'

export interface SentDiscordMessage {
  channelID: string
  messageID: string
}

export async function sendReply(
  client: Client,
  source: Message,
  content: string
): Promise<SentDiscordMessage> {
  const sent = await safeCreateMessage(client, source.channelID, {
    allowedMentions: suppressAllMentions,
    content,
    messageReference: replyMessageReference(source)
  })

  return {
    channelID: sent.channelID,
    messageID: sent.id
  }
}

export async function editSentMessage(
  client: EditMessageClient<unknown>,
  target: SentDiscordMessage,
  content: string
): Promise<void> {
  await safeEditMessage(client, target.channelID, target.messageID, {
    content,
    embeds: null
  })
}

export async function editSentMessageWithEmbed(
  client: EditMessageClient<unknown>,
  target: SentDiscordMessage,
  description: string
): Promise<void> {
  const embed = {
    description
  } satisfies EmbedOptions

  await safeEditMessage(client, target.channelID, target.messageID, {
    content: null,
    embeds: [embed]
  })
}
