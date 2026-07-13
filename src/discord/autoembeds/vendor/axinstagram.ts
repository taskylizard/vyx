// Vendored and adapted with permission from edideaur/axinstagram@f98affd.
import type { ResolvedInstagramMedia } from './types.ts'

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
const MOBILE_USER_AGENT =
  'Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)'
const INSTAGRAM_APP_ID = '936619743392459'
const EMBED_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'User-Agent': DESKTOP_USER_AGENT
}

interface Candidate {
  height: number
  url: string
  width: number
}

interface AxMediaResult {
  isPhoto?: boolean
  photos?: Array<{ full: string; isVideo?: boolean; thumb: string }>
  thumbUrl?: string
  videoUrl?: string
}

export async function resolveAxInstagramMedia(
  sourceURL: string,
  signal?: AbortSignal
): Promise<ResolvedInstagramMedia | undefined> {
  const postID = instagramPostID(sourceURL)
  if (postID === undefined) {
    return undefined
  }

  const mobileData = await tryMobileAPI(postID, signal)
  if (mobileData) {
    const result = extractFromMobileData(mobileData)
    if (result) {
      return normalizeResult(result)
    }
  }

  const htmlData = await tryHTMLEmbed(postID, signal)
  if (htmlData) {
    const result = extractFromGQL(htmlData) ?? extractFromMobileData(htmlData)
    if (result) {
      return normalizeResult(result)
    }
  }

  const graphData = await tryGraphQL(postID, signal)
  if (graphData) {
    const result = extractFromGQL(graphData)
    if (result) {
      return normalizeResult(result)
    }
  }

  return undefined
}

export function biggest(candidates: Array<Candidate>): string {
  return candidates.length === 0
    ? ''
    : candidates.reduce((left, right) =>
        left.width * left.height >= right.width * right.height ? left : right
      ).url
}

export function smallest(candidates: Array<Candidate>): string {
  return candidates.length === 0
    ? ''
    : candidates.reduce((left, right) =>
        left.width * left.height <= right.width * right.height ? left : right
      ).url
}

export function extractFromGQL(data: Record<string, unknown>): AxMediaResult | undefined {
  const graphData = data.gql_data as Record<string, unknown> | undefined
  const media = (graphData?.shortcode_media ?? graphData?.xdt_shortcode_media) as
    | Record<string, unknown>
    | undefined
  if (!media) {
    return undefined
  }

  const sidecar = media.edge_sidecar_to_children as
    | { edges: Array<{ node: Record<string, unknown> }> }
    | undefined
  if (sidecar?.edges.length) {
    const photos = sidecar.edges.flatMap(({ node }) => {
      const displayURL = node.display_url as string | undefined
      const videoURL = node.video_url as string | undefined
      if (!displayURL && !videoURL) {
        return []
      }
      return [
        {
          full: videoURL ?? displayURL ?? '',
          isVideo: videoURL ? true : undefined,
          thumb: displayURL ?? videoURL ?? ''
        }
      ]
    })
    return photos.length > 0 ? { isPhoto: true, photos } : undefined
  }

  if (typeof media.video_url === 'string') {
    return { videoUrl: media.video_url }
  }
  if (typeof media.display_url === 'string') {
    return { isPhoto: true, thumbUrl: media.display_url, videoUrl: media.display_url }
  }
  return undefined
}

function extractFromMobileData(data: Record<string, unknown>): AxMediaResult | undefined {
  const carousel = data.carousel_media as Array<Record<string, unknown>> | undefined
  if (carousel) {
    const photos = carousel.flatMap((item) => {
      const candidates = imageCandidates(item)
      if (candidates.length === 0) {
        return []
      }
      const videoCandidates = item.video_versions as Array<Candidate> | undefined
      return [
        videoCandidates?.length
          ? { full: biggest(videoCandidates), isVideo: true, thumb: smallest(candidates) }
          : { full: biggest(candidates), thumb: smallest(candidates) }
      ]
    })
    return photos.length > 0 ? { isPhoto: true, photos } : undefined
  }

  const videos = data.video_versions as Array<Candidate> | undefined
  if (videos?.length) {
    return { videoUrl: biggest(videos) }
  }

  const images = imageCandidates(data)
  if (images.length > 0) {
    return { isPhoto: true, thumbUrl: smallest(images), videoUrl: biggest(images) }
  }
  return undefined
}

async function tryMobileAPI(
  postID: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | undefined> {
  const oembedURL = new URL('https://i.instagram.com/api/v1/oembed/')
  oembedURL.searchParams.set('url', `https://www.instagram.com/p/${postID}/`)
  const headers = { 'User-Agent': MOBILE_USER_AGENT, 'x-ig-app-id': INSTAGRAM_APP_ID }
  const oembed = await fetchJSON(oembedURL, { headers, signal })
  const mediaID = typeof oembed?.media_id === 'string' ? oembed.media_id : undefined
  if (!mediaID) {
    return undefined
  }

  const data = await fetchJSON(`https://i.instagram.com/api/v1/media/${mediaID}/info/`, {
    headers,
    signal
  })
  const items = data?.items as Array<Record<string, unknown>> | undefined
  return items?.[0]
}

async function tryHTMLEmbed(
  postID: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | undefined> {
  for (const suffix of ['/embed/captioned/', '/embed/']) {
    const response = await fetch(`https://www.instagram.com/p/${postID}${suffix}`, {
      headers: EMBED_HEADERS,
      signal
    }).catch(() => undefined)
    if (!response?.ok) {
      continue
    }
    const html = await response.text()
    const context = parseEmbedContext(html)
    if (context) {
      return context
    }
  }
  return undefined
}

async function tryGraphQL(
  postID: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | undefined> {
  const pageResponse = await fetch(`https://www.instagram.com/p/${postID}/`, {
    headers: EMBED_HEADERS,
    signal
  }).catch(() => undefined)
  if (!pageResponse?.ok) {
    return undefined
  }
  const html = await pageResponse.text()
  const lsd =
    (getJSONEntry('LSD', html) as { token?: string } | undefined)?.token ?? randomBase64url(8)
  const csrf =
    (getJSONEntry('InstagramSecurityConfig', html) as { csrf_token?: string } | undefined)
      ?.csrf_token ?? ''
  const appID = (getJSONEntry('DGWWebConfig', html) as { appId?: string } | undefined)?.appId
  const siteData = getJSONEntry('SiteData', html)
  const versionID = (
    getJSONEntry('WebBloksVersioningID', html) as { versioningID?: string } | undefined
  )?.versioningID
  const polaris = getJSONEntry('PolarisSiteData', html) as
    | { device_id?: string; machine_id?: string }
    | undefined
  const cookie = [
    csrf && `csrftoken=${csrf}`,
    polaris?.device_id && `ig_did=${polaris.device_id}`,
    'wd=1280x720',
    'dpr=2',
    polaris?.machine_id && `mid=${polaris.machine_id}`,
    'ig_nrcb=1'
  ]
    .filter(Boolean)
    .join('; ')
  const body = new URLSearchParams({
    __a: '1',
    __ccg: 'EXCELLENT',
    __comet_req: String(getNumber('__comet_req', html) ?? 7),
    __csr: randomBase64url(154),
    __d: 'www',
    __dyn: randomBase64url(154),
    __hs: stringValue(siteData?.haste_session, '20126.HYP:instagram_web_pkg.2.1...0'),
    __hsi: stringValue(siteData?.hsi, '7436540909012459023'),
    __req: 'b',
    __rev: String(
      (getJSONEntry('InstagramWebPushInfo', html) as { rollout_hash?: string } | undefined)
        ?.rollout_hash ?? '1019933358'
    ),
    __s: `::${randomBase64url(6)}`,
    __spin_b: stringValue(siteData?.__spin_b, 'trunk'),
    __spin_r: stringValue(siteData?.__spin_r, '1019933358'),
    __spin_t: stringValue(siteData?.__spin_t, String(Math.floor(Date.now() / 1_000))),
    __user: '0',
    av: '0',
    doc_id: '8845758582119845',
    dpr: '2',
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
    jazoest: String(getNumber('jazoest', html) ?? Math.floor(Math.random() * 10_000)),
    lsd,
    server_timestamps: 'true',
    variables: JSON.stringify({
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
      shortcode: postID
    })
  })
  const response = await fetch('https://www.instagram.com/graphql/query', {
    body,
    headers: {
      ...EMBED_HEADERS,
      'X-CSRFToken': csrf,
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
      'X-FB-LSD': lsd,
      ...(versionID ? { 'X-Bloks-Version-Id': versionID } : {}),
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
      'x-asbd-id': '129477',
      'x-ig-app-id': appID ?? INSTAGRAM_APP_ID
    },
    method: 'POST',
    signal
  }).catch(() => undefined)
  if (!response?.ok) {
    return undefined
  }
  const json = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined
  return json ? { gql_data: json.data } : undefined
}

function normalizeResult(result: AxMediaResult): ResolvedInstagramMedia | undefined {
  if (result.photos?.length) {
    return {
      items: result.photos.map((photo) => ({
        thumbnail: photo.thumb || undefined,
        type: photo.isVideo ? 'video' : 'image',
        url: photo.full
      }))
    }
  }
  if (result.videoUrl) {
    return {
      items: [
        {
          thumbnail: result.thumbUrl,
          type: result.isPhoto ? 'image' : 'video',
          url: result.videoUrl
        }
      ]
    }
  }
  return undefined
}

function parseEmbedContext(html: string): Record<string, unknown> | undefined {
  try {
    const raw = html.match(/"init",\[\],\[(.*?)\]\],/su)?.[1]
    if (raw) {
      const embedData = JSON.parse(raw) as { contextJSON?: string }
      if (embedData.contextJSON) {
        return JSON.parse(embedData.contextJSON) as Record<string, unknown>
      }
    }
  } catch {}

  try {
    const raw = html.match(/"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/su)?.[1]
    if (raw) {
      return JSON.parse(
        raw
          .replace(/\\"/gu, '"')
          .replace(/\\\\/gu, '\\')
          .replace(/\\[nr]/gu, '')
      ) as Record<string, unknown>
    }
  } catch {}
  return undefined
}

function imageCandidates(data: Record<string, unknown>): Array<Candidate> {
  return (data.image_versions2 as { candidates?: Array<Candidate> } | undefined)?.candidates ?? []
}

async function fetchJSON(
  input: string | URL,
  init: RequestInit
): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(input, init).catch(() => undefined)
  if (!response?.ok) {
    return undefined
  }
  return (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined
}

function getNumber(name: string, html: string): number | undefined {
  const value = html.match(new RegExp(`${name}=(\\d+)`, 'u'))?.[1]
  return value ? Number(value) : undefined
}

function getJSONEntry(name: string, html: string): Record<string, unknown> | undefined {
  const raw = html.match(new RegExp(`\\["${name}",.*?,({.*?}),\\d+\\]`, 'u'))?.[1]
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

function instagramPostID(sourceURL: string): string | undefined {
  try {
    return /\/(?:p|reels?)\/([a-z0-9_-]+)/iu.exec(new URL(sourceURL).pathname)?.[1]
  } catch {
    return undefined
  }
}

function randomBase64url(byteCount: number): string {
  const bytes = new Uint8Array(byteCount)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}
