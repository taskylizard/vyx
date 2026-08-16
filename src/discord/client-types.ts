import type { CreateMessageOptions, EditMessageOptions } from 'oceanic.js'

interface CreateMessageChannel<TMessage> {
  id?: string
  createMessage?(options: CreateMessageOptions): Promise<NoInfer<TMessage>>
}

interface EditMessageChannel<TMessage> {
  id?: string
  editMessage?(messageID: string, options: EditMessageOptions): Promise<NoInfer<TMessage>>
}

interface MessageCacheChannel<TMessage> {
  id?: string
  getMessage?(messageID: string): Promise<NoInfer<TMessage>>
  messages?: {
    get(messageID: string): NoInfer<TMessage> | undefined
  }
}

interface TypingChannel {
  id?: string
  sendTyping?(): Promise<void>
}

export interface CreateMessageClient<TMessage> {
  getChannel?(channelID: string): CreateMessageChannel<TMessage> | undefined
  rest: {
    channels: {
      createMessage(channelID: string, options: CreateMessageOptions): Promise<TMessage>
    }
  }
}

export interface EditMessageClient<TMessage> {
  getChannel?(channelID: string): EditMessageChannel<TMessage> | undefined
  rest: {
    channels: {
      editMessage(
        channelID: string,
        messageID: string,
        options: EditMessageOptions
      ): Promise<TMessage>
    }
  }
}

export interface MessageFetchClient<TMessage> {
  getChannel?(channelID: string): MessageCacheChannel<TMessage> | undefined
  rest: {
    channels: {
      getMessage(channelID: string, messageID: string): Promise<TMessage>
    }
  }
}

export interface SendTypingClient {
  getChannel?(channelID: string): TypingChannel | undefined
  rest: {
    channels: {
      sendTyping(channelID: string): Promise<void>
    }
  }
}

export interface ReactionMessage {
  channelID: string
  client: {
    rest: {
      channels: {
        createReaction(channelID: string, messageID: string, emoji: string): Promise<unknown>
      }
    }
  }
  createReaction(emoji: string): Promise<unknown>
  id: string
}
