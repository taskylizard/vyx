import {
  ButtonStyles,
  ComponentTypes,
  MessageFlags,
  type ContainerComponent,
  type Message,
  type MessageComponent
} from 'oceanic.js'
import type { BotContext } from '../../bot/context.ts'
import { escapeMarkdown, textDisplay, trimComponentText, unfurledMedia } from './components.ts'
import { allowedMentions, messageReference } from './discord.ts'
import { BROWSER_USER_AGENT, MAX_DISCORD_ATTACHMENTS } from './media.ts'
import type {
  InstagramCacheEntry,
  InstagramComponentAssets,
  InstagramPost,
  InstagramResolution
} from './instagram-types.ts'
import { resolveAxInstagramMedia } from './vendor/axinstagram.ts'
import { resolveSnapSaveInstagramMedia } from './vendor/snapsave/instagram.ts'
import type { ResolvedInstagramMedia } from './vendor/types.ts'

export type { InstagramComponentAssets } from './instagram-types.ts'

const INSTAGRAM_POST_PATH_PATTERN = /\/(?:[^/]+\/)?(?:p|reels?|tv)\/([a-z0-9_-]+)/iu
const INSTAGRAM_COMPONENT_COLOR = 0xce0071
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact'
})
const INSTAGRAM_CACHE_TTL_MS = 5 * 60_000
const INSTAGRAM_NEGATIVE_CACHE_TTL_MS = 30_000
const INSTAGRAM_RICH_COOLDOWN_MS = 60_000

const instagramCache = new Map<string, InstagramCacheEntry>()
const instagramInFlight = new Map<string, Promise<InstagramResolution | undefined>>()
let richLookupBlockedUntil = 0

export async function sendInstagramAutoembed(
  context: BotContext,
  message: Message,
  sourceURL: string
): Promise<void> {
  const resolution = await resolveInstagram(sourceURL)
  if (resolution === undefined) {
    throw new Error('Instagram media resolution failed')
  }
  const realURL = canonicalInstagramURL(sourceURL)

  if (resolution.kind === 'media') {
    context.logger.info(`instagram autoembed resolved via ${resolution.strategy} fallback`)
    await context.client.rest.channels.createMessage(message.channelID, {
      allowedMentions,
      components: instagramMediaComponents(realURL, resolution.media),
      flags: MessageFlags.IS_COMPONENTS_V2,
      messageReference: messageReference(message)
    })
    return
  }

  const sharer = await fetchInstagramSharerSafely(context, sourceURL)
  const assets = prepareInstagramAssets(resolution.post)
  await context.client.rest.channels.createMessage(message.channelID, {
    allowedMentions,
    components: instagramComponents(realURL, resolution.post, assets, sharer),
    flags: MessageFlags.IS_COMPONENTS_V2,
    messageReference: messageReference(message)
  })
}

export function instagramMediaComponents(
  realURL: string,
  media: ResolvedInstagramMedia
): Array<MessageComponent> {
  const mediaItems = media.items.slice(0, MAX_DISCORD_ATTACHMENTS).map((item) => ({
    media: unfurledMedia(item.url)
  }))
  const containerComponents: ContainerComponent['components'] = [
    textDisplay('## Instagram\n-# Media preview')
  ]
  if (mediaItems.length > 0) {
    containerComponents.push({ items: mediaItems, type: ComponentTypes.MEDIA_GALLERY })
  }
  containerComponents.push({
    accessory: {
      label: 'View Post',
      style: ButtonStyles.LINK,
      type: ComponentTypes.BUTTON,
      url: realURL
    },
    components: [textDisplay('-# Instagram')],
    type: ComponentTypes.SECTION
  })

  return [
    {
      accentColor: INSTAGRAM_COMPONENT_COLOR,
      components: containerComponents,
      type: ComponentTypes.CONTAINER
    }
  ]
}

export function instagramComponents(
  realURL: string,
  post: InstagramPost,
  assets: InstagramComponentAssets,
  sharer?: string
): Array<MessageComponent> {
  const username = post.user.username
  const displayName = post.user.full_name || username
  const verified = post.user.is_verified ? ' ✓' : ''
  const coauthors = (post.coauthor_producers ?? [])
    .flatMap((coauthor) => (coauthor.username ? [coauthor.username] : []))
    .map((coauthor) => `[@${escapeMarkdown(coauthor)}](https://instagram.com/${coauthor})`)
    .join(', ')

  let header = `## ${escapeMarkdown(displayName)}${verified}\n-# [@${escapeMarkdown(username)}](https://instagram.com/${username})`
  if (coauthors.length > 0) {
    header += ` (with ${coauthors})`
  }

  const song = post.clips_metadata?.music_info?.music_asset_info
  if (song?.display_artist || song?.title) {
    const songLabel = [song.display_artist, song.title].filter(Boolean).join(' — ')
    header += `\n-# ♫ ${escapeMarkdown(songLabel)}`
  }

  const caption = cleanInstagramText(post.caption?.text ?? '')
  if (caption.length > 0) {
    header += `\n${caption}`
  }

  const containerComponents: ContainerComponent['components'] = []
  if (post.user.profile_pic_url) {
    containerComponents.push({
      accessory: {
        media: unfurledMedia(post.user.profile_pic_url),
        type: ComponentTypes.THUMBNAIL
      },
      components: [textDisplay(trimComponentText(header, 3500))],
      type: ComponentTypes.SECTION
    })
  } else {
    containerComponents.push(textDisplay(trimComponentText(header, 3500)))
  }

  if (assets.mediaItems.length > 0) {
    containerComponents.push({
      items: assets.mediaItems,
      type: ComponentTypes.MEDIA_GALLERY
    })
  }

  const stats = instagramStats(post)
  const timestamp = post.taken_at ? `<t:${post.taken_at}:F>` : 'unknown time'
  let footer = stats.length > 0 ? `### -# ${stats}\n` : ''
  footer += `-# Instagram - ${timestamp}`
  if (sharer) {
    footer += `\n-# Shared by [@${escapeMarkdown(sharer)}](https://instagram.com/${sharer})`
  }

  containerComponents.push({
    accessory: {
      label: 'View Post',
      style: ButtonStyles.LINK,
      type: ComponentTypes.BUTTON,
      url: realURL
    },
    components: [textDisplay(footer)],
    type: ComponentTypes.SECTION
  })

  return [
    {
      accentColor: INSTAGRAM_COMPONENT_COLOR,
      components: containerComponents,
      type: ComponentTypes.CONTAINER
    }
  ]
}

function prepareInstagramAssets(post: InstagramPost): InstagramComponentAssets {
  const mediaURLs = instagramMediaURLs(post).slice(0, MAX_DISCORD_ATTACHMENTS)
  return {
    mediaItems: mediaURLs.map((url) => ({ media: unfurledMedia(url) }))
  }
}

async function resolveInstagram(sourceURL: string): Promise<InstagramResolution | undefined> {
  const cacheKey = instagramShortcode(sourceURL) ?? canonicalInstagramURL(sourceURL)
  const cached = instagramCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.resolution
  }

  const active = instagramInFlight.get(cacheKey)
  if (active) {
    return active
  }

  const promise = resolveInstagramUncached(sourceURL)
    .then((resolution) => {
      instagramCache.set(cacheKey, {
        expiresAt:
          Date.now() +
          (resolution === undefined ? INSTAGRAM_NEGATIVE_CACHE_TTL_MS : INSTAGRAM_CACHE_TTL_MS),
        resolution
      })
      return resolution
    })
    .finally(() => instagramInFlight.delete(cacheKey))
  instagramInFlight.set(cacheKey, promise)
  return promise
}

async function resolveInstagramUncached(
  sourceURL: string
): Promise<InstagramResolution | undefined> {
  const canonicalURL = canonicalInstagramURL(sourceURL)
  if (Date.now() >= richLookupBlockedUntil) {
    try {
      const post = await withStrategyTimeout(5_000, (signal) =>
        fetchInstagramPost(sourceURL, signal)
      )
      return { kind: 'rich', post }
    } catch (error) {
      if (isInstagramRateLimitError(error)) {
        richLookupBlockedUntil = Date.now() + INSTAGRAM_RICH_COOLDOWN_MS
      }
    }
  }

  const nativeMedia = await withStrategyTimeout(8_000, (signal) =>
    resolveAxInstagramMedia(canonicalURL, signal)
  ).catch(() => undefined)
  if (nativeMedia?.items.length) {
    return { kind: 'media', media: nativeMedia, strategy: 'native' }
  }

  const snapSaveMedia = await withStrategyTimeout(10_000, (signal) =>
    resolveSnapSaveInstagramMedia(canonicalURL, signal)
  ).catch(() => undefined)
  return snapSaveMedia?.items.length
    ? { kind: 'media', media: snapSaveMedia, strategy: 'snapsave' }
    : undefined
}

async function withStrategyTimeout<T>(
  milliseconds: number,
  action: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('Instagram strategy timed out')),
    milliseconds
  )
  try {
    return await action(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export function resetInstagramResolutionStateForTests(): void {
  instagramCache.clear()
  instagramInFlight.clear()
  richLookupBlockedUntil = 0
}

async function fetchInstagramPost(sourceURL: string, signal?: AbortSignal): Promise<InstagramPost> {
  const shortcode = instagramShortcode(sourceURL)
  if (shortcode === undefined) {
    throw new Error('Instagram URL does not contain a supported post')
  }

  const variables = {
    __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    shortcode
  }
  const apiURL = new URL('https://www.instagram.com/graphql/query')
  apiURL.searchParams.set('server_timestamps', 'true')
  apiURL.searchParams.set('variables', JSON.stringify(variables))
  apiURL.searchParams.set('doc_id', '26130443479876713')

  const response = await fetch(apiURL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BROWSER_USER_AGENT
    },
    signal
  })
  if (!response.ok) {
    throw new InstagramRequestError(response.status)
  }

  const data = (await response.json()) as {
    data?: {
      xdt_api__v1__media__shortcode__web_info?: {
        items?: Array<InstagramPost> | null
      } | null
    } | null
  }
  const post = data.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0]
  if (post === undefined) {
    throw new Error('Instagram post is unavailable without authentication')
  }

  return post
}

class InstagramRequestError extends Error {
  constructor(readonly status: number) {
    super(`Instagram post fetch failed with ${status}`)
  }
}

function isInstagramRateLimitError(error: unknown): boolean {
  return error instanceof InstagramRequestError && (error.status === 401 || error.status === 429)
}

async function fetchInstagramSharerSafely(
  context: BotContext,
  sourceURL: string
): Promise<string | undefined> {
  try {
    return await fetchInstagramSharer(sourceURL)
  } catch (error) {
    context.logger.warn('failed to fetch instagram sharer', error)
    return undefined
  }
}

async function fetchInstagramSharer(sourceURL: string): Promise<string | undefined> {
  const parsed = new URL(sourceURL)
  const shortcode = instagramShortcode(sourceURL)
  const shareID = parsed.searchParams.get('igsh')
  if (shortcode === undefined || shareID === null) {
    return undefined
  }

  const apiURL = new URL('https://www.instagram.com/graphql/query/')
  apiURL.searchParams.set('doc_id', '9545140138880336')
  apiURL.searchParams.set(
    'variables',
    JSON.stringify({
      mediaId: instagramShortcodeToID(shortcode),
      shid: shareID
    })
  )
  const response = await fetch(apiURL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BROWSER_USER_AGENT
    }
  })
  if (!response.ok) {
    throw new Error(`Instagram sharer fetch failed with ${response.status}`)
  }

  const data = (await response.json()) as {
    data?: {
      xdt_get_relationship_for_shid_logged_out?: {
        sender?: { username?: string | null } | null
      } | null
    } | null
  }
  return data.data?.xdt_get_relationship_for_shid_logged_out?.sender?.username ?? undefined
}

function instagramShortcode(url: string): string | undefined {
  try {
    return INSTAGRAM_POST_PATH_PATTERN.exec(new URL(url).pathname)?.[1]
  } catch {
    return undefined
  }
}

function instagramShortcodeToID(shortcode: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let id = 0n

  for (const character of shortcode) {
    const value = alphabet.indexOf(character)
    if (value === -1) {
      throw new Error('Instagram shortcode contains an unsupported character')
    }
    id = id * 64n + BigInt(value)
  }

  return String(id)
}

function canonicalInstagramURL(url: string): string {
  const parsed = new URL(url)
  parsed.protocol = 'https:'
  parsed.hostname = 'instagram.com'
  parsed.port = ''
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function instagramMediaURLs(post: InstagramPost): Array<string> {
  const media = post.media_type === 8 ? (post.carousel_media ?? []) : [post]
  return media.flatMap((item) => {
    if (item.media_type === 2) {
      const url = item.video_versions?.[0]?.url
      return url ? [url] : []
    }
    if (item.media_type === 1) {
      const url = item.image_versions2?.candidates?.[0]?.url
      return url ? [url] : []
    }
    return []
  })
}

function instagramStats(post: InstagramPost): string {
  const stats: Array<string> = []
  if ((post.like_count ?? 0) > 0) {
    stats.push(`♥ ${compactNumberFormatter.format(post.like_count ?? 0)}`)
  }
  if ((post.comment_count ?? 0) > 0) {
    stats.push(`💬 ${compactNumberFormatter.format(post.comment_count ?? 0)}`)
  }
  return stats.join('　')
}

function cleanInstagramText(content: string): string {
  return content.replaceAll('`', 'ˋ').replaceAll('*', '∗').replaceAll('||', '| |').trim()
}
