import { Buffer } from 'node:buffer'
import {
  ButtonStyles,
  ComponentTypes,
  MessageFlags,
  type ContainerComponent,
  type MediaGalleryItem,
  type MessageComponent
} from 'oceanic.js'
import { replyMessageReference, suppressAllMentions } from '../message-options.ts'
import { safeCreateMessage } from '../safe-actions.ts'
import {
  discordTimestamp,
  escapeMarkdown,
  textDisplay,
  trimComponentText,
  unfurledMedia
} from './components.ts'
import {
  BROWSER_USER_AGENT,
  MAX_DISCORD_ATTACHMENTS,
  downloadAutoembedAssetSafely
} from './media.ts'
import {
  TwitterStatusSchema,
  type PreparedTwitterAssets,
  type TwitterComponentAssets,
  type TwitterStatus
} from './twitter-types.ts'
import type { AutoembedContext, AutoembedMessage } from './types.ts'

const TWITTER_COMPONENT_COLOR = 0x1da1f2
const DEFAULT_PRIVATE_API_HOST_BASE64 = 'ZmF1bmEuYWx5eGlhLmRldg=='

export type { TwitterComponentAssets } from './twitter-types.ts'

export async function sendTwitterAutoembed(
  context: AutoembedContext,
  message: AutoembedMessage,
  realURL: string,
  statusID: string
): Promise<void> {
  const status = await fetchTwitterStatus(statusID, context.env.FAUNA_URL)
  const assets = await prepareTwitterAssets(context, status)
  await safeCreateMessage(context.client, message.channelID, {
    allowedMentions: suppressAllMentions,
    components: twitterComponents(realURL, status, assets),
    files: assets.files,
    flags: MessageFlags.IS_COMPONENTS_V2,
    messageReference: replyMessageReference(message)
  })
}

export function twitterComponents(
  realURL: string,
  status: TwitterStatus,
  assets: TwitterComponentAssets
): Array<MessageComponent> {
  const timestamp = discordTimestamp(status.created_at) ?? 'unknown time'
  const account = status.account
  const displayName = account?.display_name ?? account?.username ?? 'Twitter'
  const username = account?.username ?? account?.acct?.split('@')[0]
  const handle = username ? `@${username}` : '@unknown'
  const authorURL = username ? `https://x.com/${username}` : realURL
  const content = cleanedStatusContent(status.content ?? '')
  const label = account?.fields?.find((field) => field.name === 'PCF Label')?.value

  let header = `## ${escapeMarkdown(displayName)}\n-# [${handle}](${authorURL})`
  if (label) {
    header += ` - ${label} account`
  }
  if (content.length > 0) {
    header += `\n${content}`
  }

  const containerComponents: ContainerComponent['components'] = []
  if (assets.avatarReference) {
    containerComponents.push({
      accessory: {
        media: unfurledMedia(assets.avatarReference),
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

  containerComponents.push({
    accessory: {
      label: 'View Post',
      style: ButtonStyles.LINK,
      type: ComponentTypes.BUTTON,
      url: realURL
    },
    components: [textDisplay(`-# Twitter - ${timestamp}`)],
    type: ComponentTypes.SECTION
  })

  return [
    {
      accentColor: TWITTER_COMPONENT_COLOR,
      components: containerComponents,
      type: ComponentTypes.CONTAINER
    }
  ]
}

async function prepareTwitterAssets(
  context: AutoembedContext,
  status: TwitterStatus
): Promise<PreparedTwitterAssets> {
  const avatarURL = status.account?.avatar
  const mediaLimit = avatarURL ? MAX_DISCORD_ATTACHMENTS - 1 : MAX_DISCORD_ATTACHMENTS
  const mediaAttachments = (status.media_attachments ?? [])
    .flatMap((attachment) => {
      const url = attachment.url ?? attachment.preview_url
      return url ? [{ attachment, url }] : []
    })
    .slice(0, mediaLimit)

  const [avatar, ...media] = await Promise.all([
    avatarURL
      ? downloadAutoembedAssetSafely(context, avatarURL, 'twitter-avatar')
      : Promise.resolve(undefined),
    ...mediaAttachments.map(({ url }, index) =>
      downloadAutoembedAssetSafely(context, url, `twitter-media-${index + 1}`)
    )
  ])

  const mediaItems = media.flatMap((asset, index): Array<MediaGalleryItem> => {
    if (asset === undefined) {
      return []
    }

    const description = mediaAttachments[index]?.attachment.description
    return [
      {
        description: description ? trimComponentText(description, 1024) : undefined,
        media: unfurledMedia(asset.reference)
      }
    ]
  })

  return {
    avatarReference: avatar?.reference,
    files: [avatar, ...media].flatMap((asset) => (asset === undefined ? [] : [asset.file])),
    mediaItems
  }
}

async function fetchTwitterStatus(statusID: string, faunaURL?: string): Promise<TwitterStatus> {
  const url = `${normalizePrivateAPIURL(faunaURL)}/api/v1/statuses/${statusID}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Twitter status fetch failed with ${response.status}: ${await response.text()}`)
  }

  const payload: unknown = await response.json()
  const status = TwitterStatusSchema.safeParse(payload)
  if (!status.success) {
    throw new Error('Twitter status API returned an invalid response')
  }
  return status.data
}

function normalizePrivateAPIURL(privateAPIURL?: string): string {
  const defaultHost = Buffer.from(DEFAULT_PRIVATE_API_HOST_BASE64, 'base64').toString('utf8')
  const configuredHost = privateAPIURL?.trim()
  const value =
    configuredHost === undefined || configuredHost.length === 0 ? defaultHost : configuredHost
  const withoutTrailingSlash = value.replace(/\/+$/gu, '')
  return /^https?:\/\//iu.test(withoutTrailingSlash)
    ? withoutTrailingSlash
    : `https://${withoutTrailingSlash}`
}

function cleanedStatusContent(content: string): string {
  return decodeHTMLEntities(content.replace(/<[^>]*>/gu, ''))
    .replaceAll('||', '| |')
    .trim()
}

function decodeHTMLEntities(content: string): string {
  return content
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&rsquo;', "'")
    .replaceAll('&lsquo;', "'")
    .replaceAll('&nbsp;', ' ')
}
