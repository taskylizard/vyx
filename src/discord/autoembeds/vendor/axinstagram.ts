// oxlint-disable no-underscore-dangle
import { z } from 'zod'
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

const CandidateSchema = z.object({
  height: z.number(),
  url: z.string(),
  width: z.number()
})

const ImageVersionsSchema = z.object({
  candidates: z.array(CandidateSchema).nullable().optional()
})
const MobileMediaItemSchema = z.object({
  image_versions2: ImageVersionsSchema.nullable().optional(),
  video_versions: z.array(CandidateSchema).nullable().optional()
})
const MobileMediaSchema = MobileMediaItemSchema.extend({
  carousel_media: z.array(MobileMediaItemSchema).nullable().optional()
})
const GqlMediaSchema = z.object({
  display_url: z.string().nullable().optional(),
  edge_sidecar_to_children: z
    .object({
      edges: z.array(
        z.object({
          node: z.object({
            display_url: z.string().nullable().optional(),
            video_url: z.string().nullable().optional()
          })
        })
      )
    })
    .nullable()
    .optional(),
  video_url: z.string().nullable().optional()
})
const GqlEnvelopeSchema = z.object({
  gql_data: z
    .object({
      shortcode_media: GqlMediaSchema.nullable().optional(),
      xdt_shortcode_media: GqlMediaSchema.nullable().optional()
    })
    .nullable()
    .optional()
})
const OembedSchema = z.object({ media_id: z.string().optional() })
const MobileInfoSchema = z.object({ items: z.array(MobileMediaSchema).nullable().optional() })
const LsdSchema = z.object({ token: z.string().optional() })
const InstagramSecurityConfigSchema = z.object({ csrf_token: z.string().optional() })
const DgwWebConfigSchema = z.object({ appId: z.string().optional() })
const WebBloksVersioningSchema = z.object({ versioningID: z.string().optional() })
const PolarisSiteDataSchema = z.object({
  device_id: z.string().optional(),
  machine_id: z.string().optional()
})
const SiteDataSchema = z.object({
  __spin_b: z.union([z.string(), z.number()]).optional(),
  __spin_r: z.union([z.string(), z.number()]).optional(),
  __spin_t: z.union([z.string(), z.number()]).optional(),
  haste_session: z.union([z.string(), z.number()]).optional(),
  hsi: z.union([z.string(), z.number()]).optional()
})
const InstagramWebPushInfoSchema = z.object({ rollout_hash: z.string().optional() })
const GraphQLResponseSchema = z.object({ data: z.unknown().optional() })
const EmbedDataSchema = z.object({ contextJSON: z.string().optional() })

type Candidate = z.infer<typeof CandidateSchema>
type MobileMedia = z.infer<typeof MobileMediaSchema>

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

export function extractFromGQL(data: unknown): AxMediaResult | undefined {
  const parsed = GqlEnvelopeSchema.safeParse(data)
  if (!parsed.success) {
    return undefined
  }
  const media = parsed.data.gql_data?.shortcode_media ?? parsed.data.gql_data?.xdt_shortcode_media
  if (!media) return undefined

  const sidecar = media.edge_sidecar_to_children
  if (sidecar?.edges.length) {
    const photos = sidecar.edges.flatMap(({ node }) => {
      const displayURL = node.display_url
      const videoURL = node.video_url
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

  if (typeof media.video_url === 'string') return { videoUrl: media.video_url }
  if (typeof media.display_url === 'string')
    return { isPhoto: true, thumbUrl: media.display_url, videoUrl: media.display_url }

  return undefined
}

function extractFromMobileData(data: unknown): AxMediaResult | undefined {
  const parsed = MobileMediaSchema.safeParse(data)
  if (!parsed.success) return undefined

  const carousel = parsed.data.carousel_media
  if (carousel) {
    const photos = carousel.flatMap((item) => {
      const candidates = imageCandidates(item)
      if (candidates.length === 0) {
        return []
      }
      const videoCandidates = item.video_versions
      return [
        videoCandidates?.length
          ? { full: biggest(videoCandidates), isVideo: true, thumb: smallest(candidates) }
          : { full: biggest(candidates), thumb: smallest(candidates) }
      ]
    })
    return photos.length > 0 ? { isPhoto: true, photos } : undefined
  }

  const videos = parsed.data.video_versions
  if (videos?.length) {
    return { videoUrl: biggest(videos) }
  }

  const images = imageCandidates(parsed.data)
  if (images.length > 0) {
    return { isPhoto: true, thumbUrl: smallest(images), videoUrl: biggest(images) }
  }
  return undefined
}

async function tryMobileAPI(
  postID: string,
  signal?: AbortSignal
): Promise<MobileMedia | undefined> {
  const oembedURL = new URL('https://i.instagram.com/api/v1/oembed/')
  oembedURL.searchParams.set('url', `https://www.instagram.com/p/${postID}/`)
  const headers = { 'User-Agent': MOBILE_USER_AGENT, 'x-ig-app-id': INSTAGRAM_APP_ID }
  const oembed = OembedSchema.safeParse(await fetchJSON(oembedURL, { headers, signal }))
  if (!oembed.success || oembed.data.media_id === undefined) {
    return undefined
  }

  const data = MobileInfoSchema.safeParse(
    await fetchJSON(`https://i.instagram.com/api/v1/media/${oembed.data.media_id}/info/`, {
      headers,
      signal
    })
  )
  return data.success ? data.data.items?.[0] : undefined
}

async function tryHTMLEmbed(postID: string, signal?: AbortSignal): Promise<unknown> {
  for (const suffix of ['/embed/captioned/', '/embed/']) {
    // eslint-disable-next-line no-await-in-loop -- tasky: sequential fallback, tries embed endpoints one at a time
    const response = await fetch(`https://www.instagram.com/p/${postID}${suffix}`, {
      headers: EMBED_HEADERS,
      signal
    }).catch(() => undefined)
    if (!response?.ok) {
      continue
    }
    // eslint-disable-next-line no-await-in-loop -- tasky: same reason as ^^, reads the response body before trying the next endpoint
    const html = await response.text()
    const context = parseEmbedContext(html)
    if (context) {
      return context
    }
  }
  return undefined
}

async function tryGraphQL(postID: string, signal?: AbortSignal): Promise<unknown> {
  const pageResponse = await fetch(`https://www.instagram.com/p/${postID}/`, {
    headers: EMBED_HEADERS,
    signal
  }).catch(() => undefined)
  if (!pageResponse?.ok) {
    return undefined
  }
  const html = await pageResponse.text()
  const lsdEntry = LsdSchema.safeParse(getJSONEntry('LSD', html))
  const security = InstagramSecurityConfigSchema.safeParse(
    getJSONEntry('InstagramSecurityConfig', html)
  )
  const webConfig = DgwWebConfigSchema.safeParse(getJSONEntry('DGWWebConfig', html))
  const siteData = SiteDataSchema.safeParse(getJSONEntry('SiteData', html))
  const versioning = WebBloksVersioningSchema.safeParse(getJSONEntry('WebBloksVersioningID', html))
  const polaris = PolarisSiteDataSchema.safeParse(getJSONEntry('PolarisSiteData', html))
  const pushInfo = InstagramWebPushInfoSchema.safeParse(getJSONEntry('InstagramWebPushInfo', html))
  const lsd = lsdEntry.success ? (lsdEntry.data.token ?? randomBase64url(8)) : randomBase64url(8)
  const csrf = security.success ? (security.data.csrf_token ?? '') : ''
  const appID = webConfig.success ? webConfig.data.appId : undefined
  const versionID = versioning.success ? versioning.data.versioningID : undefined
  const polarisData = polaris.success ? polaris.data : undefined
  const site = siteData.success ? siteData.data : undefined
  const cookie = [
    csrf && `csrftoken=${csrf}`,
    polarisData?.device_id && `ig_did=${polarisData.device_id}`,
    'wd=1280x720',
    'dpr=2',
    polarisData?.machine_id && `mid=${polarisData.machine_id}`,
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
    __hs: String(site?.haste_session ?? '20126.HYP:instagram_web_pkg.2.1...0'),
    __hsi: String(site?.hsi ?? '7436540909012459023'),
    __req: 'b',
    __rev: pushInfo.success ? (pushInfo.data.rollout_hash ?? '1019933358') : '1019933358',
    __s: `::${randomBase64url(6)}`,
    __spin_b: String(site?.__spin_b ?? 'trunk'),
    __spin_r: String(site?.__spin_r ?? '1019933358'),
    __spin_t: String(site?.__spin_t ?? Math.floor(Date.now() / 1_000)),
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
  const json: unknown = await response.json().catch(() => undefined)
  const parsed = GraphQLResponseSchema.safeParse(json)
  return parsed.success ? { gql_data: parsed.data.data } : undefined
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

function parseEmbedContext(html: string): unknown {
  try {
    const raw = html.match(/"init",\[\],\[(.*?)\]\],/su)?.[1]
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      const embedData = EmbedDataSchema.safeParse(parsed)
      if (embedData.success && embedData.data.contextJSON !== undefined) {
        const context: unknown = JSON.parse(embedData.data.contextJSON)
        return context
      }
    }
  } catch {}

  try {
    const raw = html.match(/"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/su)?.[1]
    if (raw) {
      const context: unknown = JSON.parse(
        raw
          .replace(/\\"/gu, '"')
          .replace(/\\\\/gu, '\\')
          .replace(/\\[nr]/gu, '')
      )
      return context
    }
  } catch {}
  return undefined
}

function imageCandidates(data: z.infer<typeof MobileMediaItemSchema>): Array<Candidate> {
  return data.image_versions2?.candidates ?? []
}

async function fetchJSON(input: string | URL, init: RequestInit): Promise<unknown> {
  const response = await fetch(input, init).catch(() => undefined)
  if (!response?.ok) {
    return undefined
  }
  return response.json().catch(() => undefined)
}

function getNumber(name: string, html: string): number | undefined {
  const value = html.match(new RegExp(`${name}=(\\d+)`, 'u'))?.[1]
  return value ? Number(value) : undefined
}

function getJSONEntry(name: string, html: string): unknown {
  const raw = html.match(new RegExp(`\\["${name}",.*?,({.*?}),\\d+\\]`, 'u'))?.[1]
  try {
    if (raw === undefined) return undefined
    const parsed: unknown = JSON.parse(raw)
    return parsed
  } catch {
    return undefined
  }
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
