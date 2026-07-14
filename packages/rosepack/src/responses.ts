import type { EditInteractionContent, InteractionContent } from 'oceanic.js'

const safeAllowedMentions = {
  everyone: false,
  repliedUser: false,
  roles: false,
  users: false
} as const

export function normalizeResponseContent(
  content: EditInteractionContent | InteractionContent | string
): EditInteractionContent & InteractionContent {
  if (typeof content === 'string') {
    return { allowedMentions: safeAllowedMentions, content }
  }
  return {
    ...content,
    allowedMentions: content.allowedMentions ?? safeAllowedMentions
  } as EditInteractionContent & InteractionContent
}
