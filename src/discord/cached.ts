import type { Client, Message } from 'oceanic.js'

type CacheClient = Partial<Pick<Client, 'getChannel'>>

export async function fetchMessageCached(
  client: Pick<Client, 'rest'> & CacheClient,
  channelID: string,
  messageID: string
): Promise<Message> {
  const channel = client.getChannel?.(channelID)
  if (channel !== undefined && 'getMessage' in channel && 'messages' in channel) {
    const cached = channel.messages.get(messageID)
    if (cached !== undefined) return cached

    try {
      return await channel.getMessage(messageID)
    } catch {
      return client.rest.channels.getMessage(channelID, messageID)
    }
  }

  return client.rest.channels.getMessage(channelID, messageID)
}

export async function fetchReferencedMessageCached(
  client: Pick<Client, 'rest'> & CacheClient,
  message: Message
): Promise<Message | undefined> {
  if (message.referencedMessage !== undefined && message.referencedMessage !== null) {
    return message.referencedMessage
  }

  const messageID = message.messageReference?.messageID
  if (messageID === undefined) {
    return undefined
  }

  return fetchMessageCached(
    client,
    message.messageReference?.channelID ?? message.channelID,
    messageID
  )
}
