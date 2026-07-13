import { Buffer } from 'node:buffer'
import type { File as DiscordFile } from 'oceanic.js'
import type { BotContext } from '../../bot/context.ts'

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const MAX_DISCORD_ATTACHMENTS = 10

const MAX_AUTOEMBED_ASSET_BYTES = 25 * 1024 * 1024
const assetExtensions = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm']
])
const supportedExtensions = new Set(assetExtensions.values())

export interface DownloadedAutoembedAsset {
  file: DiscordFile
  reference: string
}

export async function downloadAutoembedAssetSafely(
  context: BotContext,
  url: string,
  filenameBase: string
): Promise<DownloadedAutoembedAsset | undefined> {
  try {
    return await downloadAutoembedAsset(url, filenameBase)
  } catch (error) {
    context.logger.warn(`failed to download ${filenameBase}`, error)
    return undefined
  }
}

async function downloadAutoembedAsset(
  url: string,
  filenameBase: string
): Promise<DownloadedAutoembedAsset> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Autoembed asset fetch failed with ${response.status}`)
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTOEMBED_ASSET_BYTES) {
    throw new Error('Autoembed asset exceeds the upload size limit')
  }

  const contents = Buffer.from(await response.arrayBuffer())
  if (contents.byteLength > MAX_AUTOEMBED_ASSET_BYTES) {
    throw new Error('Autoembed asset exceeds the upload size limit')
  }

  const extension = autoembedAssetExtension(response.headers.get('content-type'), url)
  if (extension === undefined) {
    throw new Error('Autoembed asset has an unsupported media type')
  }

  const name = `${filenameBase}.${extension}`
  return {
    file: { contents, name },
    reference: `attachment://${name}`
  }
}

function autoembedAssetExtension(contentType: string | null, url: string): string | undefined {
  const normalizedContentType = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  const contentTypeExtension = normalizedContentType
    ? assetExtensions.get(normalizedContentType)
    : undefined
  if (contentTypeExtension !== undefined) {
    return contentTypeExtension
  }

  try {
    const extension = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/iu)?.[1]?.toLowerCase()
    return extension && supportedExtensions.has(extension) ? extension : undefined
  } catch {
    return undefined
  }
}
