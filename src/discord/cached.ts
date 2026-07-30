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
