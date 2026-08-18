import { expect, test, vi } from 'vite-plus/test'
import { attachmentContentPart, downloadFile } from '../../src/llm/attachment-content.ts'
import type { PromptAttachment } from '../../src/llm/message-input-types.ts'

function attachment(url: string, contentType: string | null = 'image/png'): PromptAttachment {
  return { contentType, url }
}

test('sends image attachments as URL file parts', async () => {
  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/cat.png', 'image/png')
  )

  expect(result).toEqual({
    data: new URL('https://cdn.discordapp.com/cat.png'),
    mediaType: 'image/png',
    type: 'file'
  })
})

test('sends video attachments as URL file parts instead of text references', async () => {
  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/clip.mp4', 'video/mp4')
  )

  expect(result).toEqual({
    data: new URL('https://cdn.discordapp.com/clip.mp4'),
    mediaType: 'video/mp4',
    type: 'file'
  })
})

test('sends PDF attachments as URL file parts', async () => {
  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/doc.pdf', 'application/pdf')
  )

  expect(result).toEqual({
    data: new URL('https://cdn.discordapp.com/doc.pdf'),
    mediaType: 'application/pdf',
    type: 'file'
  })
})

test('downloads audio attachments as base64 file parts', async () => {
  const mockFetch = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))

  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/audio.mp3', 'audio/mpeg'),
    mockFetch
  )

  expect(mockFetch).toHaveBeenCalledExactlyOnceWith('https://cdn.discordapp.com/audio.mp3')
  expect(result).toEqual({
    data: new Uint8Array([1, 2, 3]),
    mediaType: 'audio/mpeg',
    type: 'file'
  })
})

test('falls back to a text reference when audio download fails', async () => {
  const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))

  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/audio.ogg', 'audio/ogg'),
    mockFetch
  )

  expect(result).toEqual({
    text: '[audio attachment: https://cdn.discordapp.com/audio.ogg]',
    type: 'text'
  })
})

test('falls back to a text reference when audio returns a non-OK response', async () => {
  const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))

  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/audio.wav', 'audio/wav'),
    mockFetch
  )

  expect(result).toEqual({
    text: '[audio attachment: https://cdn.discordapp.com/audio.wav]',
    type: 'text'
  })
})

test('falls back to a text reference for attachments with no content type', async () => {
  const result = await attachmentContentPart(
    attachment('https://cdn.discordapp.com/file.unknown', null)
  )

  expect(result).toEqual({
    text: '[attachment: https://cdn.discordapp.com/file.unknown]',
    type: 'text'
  })
})

test('downloadFile returns undefined on network failure', async () => {
  const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'))

  const result = await downloadFile('https://example.com/audio.mp3', mockFetch)

  expect(result).toBeUndefined()
})
