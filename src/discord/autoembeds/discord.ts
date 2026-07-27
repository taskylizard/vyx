import { MessageFlags, type AllowedMentions, type Message } from 'oceanic.js'
import type { BotContext } from '../../bot/context.ts'

export const allowedMentions = {
  everyone: false,
  repliedUser: false,
  roles: false,
  users: false
} satisfies AllowedMentions

export function messageReference(message: Message) {
  return {
    channelID: message.channelID,
    failIfNotExists: false,
    guildID: message.guildID ?? undefined,
    messageID: message.id
  }
}

export async function sendTextReply(
  context: BotContext,
  message: Message,
  content: string
): Promise<void> {
  await context.client.rest.channels.createMessage(message.channelID, {
    allowedMentions,
    content,
    messageReference: messageReference(message)
  })
}

export async function suppressOriginalEmbed(context: BotContext, message: Message): Promise<void> {
  if ((message.flags & MessageFlags.SUPPRESS_EMBEDS) !== 0) {
    return
  }

  try {
    await context.client.rest.channels.editMessage(message.channelID, message.id, {
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
