import type { Buffer } from 'node:buffer'

const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php'
const CATBOX_FILE_HOST = 'files.catbox.moe'
const CATBOX_UPLOAD_TIMEOUT_MS = 30_000

export async function uploadAnonymousCatboxFile(
  contents: Buffer,
  filename: string
): Promise<string> {
  const form = new FormData()
  form.set('reqtype', 'fileupload')
  form.set('fileToUpload', new Blob([new Uint8Array(contents)]), filename)

  const response = await fetch(CATBOX_UPLOAD_URL, {
    body: form,
    method: 'POST',
    signal: AbortSignal.timeout(CATBOX_UPLOAD_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`Catbox upload failed with ${response.status}`)
  }

  const result = (await response.text()).trim()
  const url = URL.parse(result)
  if (url?.protocol !== 'https:' || url.hostname !== CATBOX_FILE_HOST) {
    throw new Error('Catbox upload returned an invalid URL')
  }

  return url.href
}
