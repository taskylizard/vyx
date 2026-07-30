import type { AllowedMentions, Message } from 'oceanic.js'

export const suppressAllMentions = {
  everyone: false,
  repliedUser: false,
  roles: false,
  users: false
} satisfies AllowedMentions

export function replyMessageReference(message: Message) {
  return {
    channelID: message.channelID,
    failIfNotExists: false,
    guildID: message.guildID ?? undefined,
    messageID: message.id
  }
}
