import { MessageFlags, type Message } from 'oceanic.js'
import type { BotContext } from '../../bot/context.ts'
import { replyMessageReference, suppressAllMentions } from '../message-options.ts'
import { safeCreateMessage, safeEditMessage } from '../safe-actions.ts'

export async function sendTextReply(
  context: BotContext,
  message: Message,
  content: string
): Promise<void> {
  await safeCreateMessage(context.client, message.channelID, {
    allowedMentions: suppressAllMentions,
    content,
    messageReference: replyMessageReference(message)
  })
}

export async function suppressOriginalEmbed(context: BotContext, message: Message): Promise<void> {
  if ((message.flags & MessageFlags.SUPPRESS_EMBEDS) !== 0) {
    return
  }

  try {
    await safeEditMessage(context.client, message.channelID, message.id, {
      flags: MessageFlags.SUPPRESS_EMBEDS
    })
  } catch (error) {
    if (!isDiscordPermissionError(error)) {
      context.logger.warn('failed to suppress original autoembedded message', { error })
    }
  }
}

function isDiscordPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const status = 'status' in error ? error.status : undefined
  const code = 'code' in error ? error.code : undefined
  return status === 403 || code === 50_001 || code === 50_013
}
