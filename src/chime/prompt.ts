import type { ModelMessage } from 'ai'
import type { ChimeObservation } from './types.ts'

/** Reply sentinel telling the watcher the model had nothing natural to add. */
export const CHIME_SKIP_SENTINEL = 'SKIP'

const MAX_CHIME_HISTORY_MESSAGES = 12

const CHIME_INSTRUCTIONS = `You are quietly reading an ongoing group chat you were not mentioned in. You may join in with ONE short remark, like a friend who has been lurking. Match the language, tone, and humor of the chat. React to what people actually said: a quick take, a joke, a small fact. Do not greet the room, introduce or refer to yourself, summarize the conversation, repeat what was already said, or ask the room broad questions. No mentions, no lists, no citations, no tools. Keep it under 200 characters and casual. If there is nothing natural or fun to add, reply with exactly ${CHIME_SKIP_SENTINEL} and nothing else.`

export interface ChimePrompt {
  readonly instructions: string
  readonly messages: ModelMessage[]
}

/**
 * Builds the conversation prompt for a chime: the recent human messages
 * formatted exactly like regular reply context, so the model reads it as chat.
 */
export function buildChimePrompt(observations: readonly ChimeObservation[]): ChimePrompt {
  const messages = observations.slice(-MAX_CHIME_HISTORY_MESSAGES).map(
    (observation): ModelMessage => ({
      content: `${observation.authorName} (ID: ${observation.authorID}): ${observation.content}`,
      role: 'user'
    })
  )

  return { instructions: CHIME_INSTRUCTIONS, messages }
}

export function isChimeSkip(content: string): boolean {
  return content.trim().toUpperCase() === CHIME_SKIP_SENTINEL
}
