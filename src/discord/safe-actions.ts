import type { Client, CreateMessageOptions, EditMessageOptions, Message } from 'oceanic.js'

type CachedClient = Partial<Pick<Client, 'getChannel'>>

type ActionClient<TAction extends keyof Client['rest']['channels']> = CachedClient & {
  rest: { channels: Pick<Client['rest']['channels'], TAction> }
}

export async function safeCreateMessage(
  client: ActionClient<'createMessage'>,
  channelID: string,
  options: CreateMessageOptions
): Promise<Message> {
  const channel = client.getChannel?.(channelID)
  if (channel !== undefined && 'createMessage' in channel) {
    try {
      return await channel.createMessage(options)
    } catch {
      return client.rest.channels.createMessage(channelID, options)
    }
  }

  return client.rest.channels.createMessage(channelID, options)
}

export async function safeEditMessage(
  client: ActionClient<'editMessage'>,
  channelID: string,
  messageID: string,
  options: EditMessageOptions
): Promise<Message> {
  const channel = client.getChannel?.(channelID)
  if (channel !== undefined && 'editMessage' in channel) {
    try {
      return await channel.editMessage(messageID, options)
    } catch {
      return client.rest.channels.editMessage(channelID, messageID, options)
    }
  }

  return client.rest.channels.editMessage(channelID, messageID, options)
}

export async function safeSendTyping(
  client: ActionClient<'sendTyping'>,
  channelID: string
): Promise<void> {
  const channel = client.getChannel?.(channelID)
  if (channel !== undefined && 'sendTyping' in channel) {
    try {
      await channel.sendTyping()
      return
    } catch {
      await client.rest.channels.sendTyping(channelID)
      return
    }
  }

  await client.rest.channels.sendTyping(channelID)
}

export async function safeCreateReaction(message: Message, emoji: string): Promise<boolean> {
  try {
    await message.createReaction(emoji)
    return true
  } catch {
    try {
      await message.client.rest.channels.createReaction(message.channelID, message.id, emoji)
      return true
    } catch {
      return false
    }
  }
}
