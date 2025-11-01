import type { EmbedOptions } from 'oceanic.js'

export type ResponseOptions = {
  content?: string
  embeds?: EmbedOptions[]
  files?: any[]
}

/**
 * Formats a long text response for Discord by splitting it into content, embed, or file based on length.
 * - <= 2000 chars: regular message content
 * - 2001-4096 chars: embed description
 * - > 4096 chars: content with first 2000 chars + file attachment
 */
export function formatLongResponse(text: string): ResponseOptions {
  const textLength = text.length
  const options: ResponseOptions = {}

  if (textLength <= 2000) {
    options.content = text
  } else if (textLength < 4096) {
    options.embeds = [{ description: text }]
  } else {
    options.content = text.slice(0, 2000)
    options.files = [new File([Buffer.from(text, 'utf-8')], 'response.md')]
  }

  return options
}
