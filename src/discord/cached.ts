import type { MessageFetchClient } from './client-types.ts'

export interface ReferencedMessage<TMessage> {
  channelID: string
  messageReference?: {
    channelID?: string
    messageID?: string
  } | null
  referencedMessage?: TMessage | null
}

export async function fetchMessageCached<TMessage>(
  client: MessageFetchClient<TMessage>,
  channelID: string,
  messageID: string
): Promise<TMessage> {
  const channel = client.getChannel?.(channelID)
  if (channel?.getMessage !== undefined && channel.messages !== undefined) {
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

export async function fetchReferencedMessageCached<TMessage>(
  client: MessageFetchClient<TMessage>,
  message: ReferencedMessage<TMessage>
): Promise<TMessage | undefined> {
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
