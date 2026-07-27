// Vendored and adapted from ahmedrangel/snapsave-media-downloader@0103417.
import { load } from 'cheerio'
import { decryptSnapSave } from './decrypter.ts'
import type { ResolvedInstagramMedia, ResolvedInstagramMediaItem } from '../types.ts'

const INSTAGRAM_URL_PATTERN =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv|stories|share)\/([^/?#&]+).*/iu
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export async function resolveSnapSaveInstagramMedia(
  sourceURL: string,
  signal?: AbortSignal
): Promise<ResolvedInstagramMedia | undefined> {
  if (!INSTAGRAM_URL_PATTERN.test(sourceURL)) {
    return undefined
  }

  const formData = new URLSearchParams({ url: normalizeInstagramURL(sourceURL) })
  const response = await fetchWithRetry(
    'https://snapsave.app/action.php?lang=en',
    {
      body: formData,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://snapsave.app',
        Referer: 'https://snapsave.app/',
        'User-Agent': USER_AGENT
      },
      method: 'POST',
      signal
    },
    3,
    500
  )
  if (!response.ok) {
    return undefined
  }

  try {
    return parseSnapSaveHTML(decryptSnapSave(await response.text()))
  } catch {
    return undefined
  }
}

export function parseSnapSaveHTML(html: string): ResolvedInstagramMedia | undefined {
  const document = load(html)
  const items: Array<ResolvedInstagramMediaItem> = []

  if (document('table.table').length || document('article.media > figure').length) {
    if (document('table.table').length) {
      document('tbody > tr').each((_, row) => {
        const cells = document(row).find('td')
        const resolution = cells.eq(0).text()
        let url = cells.eq(2).find('a').attr('href') ?? cells.eq(2).find('button').attr('onclick')
        if (/get_progressApi/iu.test(url ?? '')) {
          const progressURL = /get_progressApi\('(.*?)'\)/u.exec(url ?? '')?.[1]
          url = progressURL ? `https://snapsave.app${progressURL}` : url
        }
        if (url) {
          items.push({ type: resolution ? 'video' : 'image', url })
        }
      })
    } else if (document('div.card').length) {
      document('div.card').each((_, card) => {
        const body = document(card).find('div.card-body')
        const url = body.find('a').attr('href')
        if (url) {
          items.push({
            type: body.find('a').text().trim() === 'Download Photo' ? 'image' : 'video',
            url
          })
        }
      })
    } else {
      const url = document('a').attr('href') ?? document('button').attr('onclick')
      if (url) {
        items.push({
          type: document('a').text().trim() === 'Download Photo' ? 'image' : 'video',
          url
        })
      }
    }
  } else if (document('div.download-items').length) {
    document('div.download-items').each((_, item) => {
      const thumbnail = document(item).find('div.download-items__thumb > img').attr('src')
      const button = document(item).find('div.download-items__btn')
      const type = button.find('span').text().trim() === 'Download Photo' ? 'image' : 'video'
      const url = type === 'image' ? thumbnail : button.find('a').attr('href')
      if (url) {
        items.push({
          thumbnail: type === 'video' && thumbnail ? fixThumbnail(thumbnail) : undefined,
          type,
          url
        })
      }
    })
  }

  const validItems = items.filter((item) => isPublicHTTPURL(item.url))
  return validItems.length > 0 ? { items: validItems } : undefined
}

export function normalizeInstagramURL(url: string): string {
  const withoutQuery = url.replace(/\?.*$/u, '')
  return /^(https?:\/\/)(?!www\.)[a-z0-9]+/iu.test(withoutQuery)
    ? withoutQuery.replace(/^(https?:\/\/)([^./]+\.[^./]+)(\/.*)?$/iu, '$1www.$2$3')
    : withoutQuery
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  retries: number,
  retryDelay: number
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- tasky: sequential retry with backoff, each attempt must observe the previous failure
      const response = await fetch(input, init)
      if (response.ok || attempt === retries - 1) {
        return response
      }
    } catch (error) {
      lastError = error
      if (attempt === retries - 1) {
        throw error
      }
    }
    // eslint-disable-next-line no-await-in-loop -- tasky: sequential retry with backoff, delay before the next attempt
    await abortableDelay(retryDelay, init.signal)
  }
  throw lastError instanceof Error ? lastError : new Error('SnapSave request failed')
}

function abortableDelay(milliseconds: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

function fixThumbnail(url: string): string {
  const prefix = 'https://snapinsta.app/photo.php?photo='
  return url.includes(prefix) ? decodeURIComponent(url.replace(prefix, '')) : url
}

function isPublicHTTPURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
