import type { CreateMessageOptions, EditMessageOptions } from 'oceanic.js'
import type {
  CreateMessageClient,
  EditMessageClient,
  ReactionMessage,
  SendTypingClient
} from './client-types.ts'

export async function safeCreateMessage<TMessage>(
  client: CreateMessageClient<TMessage>,
  channelID: string,
  options: CreateMessageOptions
): Promise<TMessage> {
  const channel = client.getChannel?.(channelID)
  if (channel?.createMessage !== undefined) {
    try {
      return await channel.createMessage(options)
    } catch {
      return client.rest.channels.createMessage(channelID, options)
    }
  }

  return client.rest.channels.createMessage(channelID, options)
}

export async function safeEditMessage<TMessage>(
  client: EditMessageClient<TMessage>,
  channelID: string,
  messageID: string,
  options: EditMessageOptions
): Promise<TMessage> {
  const channel = client.getChannel?.(channelID)
  if (channel?.editMessage !== undefined) {
    try {
      return await channel.editMessage(messageID, options)
    } catch {
      return client.rest.channels.editMessage(channelID, messageID, options)
    }
  }

  return client.rest.channels.editMessage(channelID, messageID, options)
}

export async function safeSendTyping(client: SendTypingClient, channelID: string): Promise<void> {
  const channel = client.getChannel?.(channelID)
  if (channel?.sendTyping !== undefined) {
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

export async function safeCreateReaction(
  message: ReactionMessage,
  emoji: string
): Promise<boolean> {
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
