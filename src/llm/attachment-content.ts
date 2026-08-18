import type { FilePart, TextPart } from 'ai'
import type { PromptAttachment } from './message-input-types.ts'

type MediaCategory = 'image' | 'video' | 'audio' | 'other'

/* tasky: categorize by top-level type prefix so we dont accidentally match "image" in a random subtype */
function categorizeMedia(contentType: string): MediaCategory {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'other'
}

/**
 * Downloads binary content from a URL into a Uint8Array.
 * Returns undefined when the download fails so callers can fall back gracefully.
 */
export async function downloadFile(
  url: string,
  fetchFile: typeof fetch = fetch
): Promise<Uint8Array | undefined> {
  try {
    const response = await fetchFile(url)
    if (!response.ok) return undefined
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return undefined
  }
}

/**
 * Converts a single Discord attachment into the appropriate AI SDK content part
 * for the OpenRouter provider.
 *
 * Images, videos, and documents (PDFs, etc.) are passed as URL-based file parts.
 * Audio must be base64-encoded for OpenRouter, so it is downloaded and passed
 * as raw bytes.
 *
 * `fetchFile` defaults to the global `fetch` and can be injected for testing.
 */
export async function attachmentContentPart(
  attachment: PromptAttachment,
  fetchFile: typeof fetch = fetch
): Promise<FilePart | TextPart> {
  const mediaType = attachment.contentType ?? ''
  const category = categorizeMedia(mediaType)

  if (category === 'audio') {
    /* tasky: openrouter rejects audio URLs, it needs base64 - download and encode */
    const data = await downloadFile(attachment.url, fetchFile)
    if (data === undefined) {
      return audioFallback(attachment.url)
    }

    return { data, mediaType, type: 'file' }
  }

  if (mediaType !== '') {
    return { data: new URL(attachment.url), mediaType, type: 'file' }
  }

  return { text: `[attachment: ${attachment.url}]`, type: 'text' }
}

function audioFallback(url: string): TextPart {
  return { text: `[audio attachment: ${url}]`, type: 'text' }
}
