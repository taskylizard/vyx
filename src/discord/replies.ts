import type { AllowedMentions, Client, EmbedOptions, Message } from 'oceanic.js'

const allowedMentions = {
  everyone: false,
  repliedUser: false,
  roles: false,
  users: false
} satisfies AllowedMentions

export interface SentDiscordMessage {
  channelID: string
  messageID: string
}

export async function sendReply(
  client: Client,
  source: Message,
  content: string
): Promise<SentDiscordMessage> {
  const sent = await client.rest.channels.createMessage(source.channelID, {
    allowedMentions,
    content,
    messageReference: {
      channelID: source.channelID,
      failIfNotExists: false,
      guildID: source.guildID ?? undefined,
      messageID: source.id
    }
  })

  return {
    channelID: sent.channelID,
    messageID: sent.id
  }
}

export async function editSentMessage(
  client: Client,
  target: SentDiscordMessage,
  content: string
): Promise<void> {
  await client.rest.channels.editMessage(target.channelID, target.messageID, {
    content,
    embeds: null
  })
}

export async function editSentMessageWithEmbed(
  client: Client,
  target: SentDiscordMessage,
  description: string
): Promise<void> {
  const embed = {
    description
  } satisfies EmbedOptions

  await client.rest.channels.editMessage(target.channelID, target.messageID, {
    content: null,
    embeds: [embed]
  })
}
