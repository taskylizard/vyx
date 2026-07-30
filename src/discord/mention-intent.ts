import type { Message } from 'oceanic.js'
import type { BotContext } from '../bot/context.ts'
import { isAutoembedMessage } from './autoembeds.ts'
import { fetchReferencedMessageCached } from './cached.ts'

export async function isIntentionalBotMention(
  context: BotContext,
  message: Message
): Promise<boolean> {
  if (!message.mentions.users.some((user) => user.id === context.botUserID)) {
    return false
  }

  if (hasExplicitBotMention(message.content, context.botUserID)) {
    return true
  }

  const referenced = await fetchReferencedMessageSafe(context, message)
  if (referenced?.author.id !== context.botUserID) {
    return true
  }

  const parent = await fetchReferencedMessageSafe(context, referenced)
  return parent === undefined || !isAutoembedMessage(parent.content)
}

function hasExplicitBotMention(content: string, botUserID: string): boolean {
  return content.includes(`<@${botUserID}>`) || content.includes(`<@!${botUserID}>`)
}

async function fetchReferencedMessageSafe(
  context: BotContext,
  message: Message
): Promise<Message | undefined> {
  try {
    return await fetchReferencedMessageCached(context.client, message)
  } catch {
    return undefined
  }
}
