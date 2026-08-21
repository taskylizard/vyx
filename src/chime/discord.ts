import type { Message } from 'oceanic.js'
import type { CreateMessageClient } from '../discord/client-types.ts'
import { suppressAllMentions } from '../discord/message-options.ts'
import { safeCreateMessage } from '../discord/safe-actions.ts'
import type { ChimeObservation } from './types.ts'

const MAX_OBSERVATION_CONTENT_LENGTH = 400

/** Converts an incoming Discord message into a trimmed chime observation. */
export function toChimeObservation(message: Message): ChimeObservation {
  return {
    authorID: message.author.id,
    authorName: displayNameOf(message),
    content: truncateObservationContent(message.content),
    id: message.id,
    timestamp: message.timestamp.getTime()
  }
}

/**
 * Sends a chime as a plain channel message with all mentions suppressed, so a
 * spontaneous remark can never ping anyone.
 */
export async function sendChime(
  client: CreateMessageClient<Message>,
  channelID: string,
  content: string
): Promise<void> {
  await safeCreateMessage(client, channelID, {
    allowedMentions: suppressAllMentions,
    content
  })
}

function displayNameOf(message: Message): string {
  return message.member?.displayName ?? message.author.globalName ?? message.author.username
}

function truncateObservationContent(content: string): string {
  if (content.length <= MAX_OBSERVATION_CONTENT_LENGTH) return content

  return `${content.slice(0, MAX_OBSERVATION_CONTENT_LENGTH)}…`
}
