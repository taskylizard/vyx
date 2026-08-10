import { match } from 'ts-pattern'

const AUTOEMBED_URL_PATTERN =
  /https?:\/\/(?<host>(?:www\.|mobile\.)?(?:twitter\.com|x\.com)|(?:www\.)?instagram\.com|kkinstagram\.com|vxinstagram\.com|kkclip\.com|imginn\.com|(?:(?:www|old|new|np|m)\.)?reddit\.com)(?<path>\/[^\s<>\]]*)?/giu
const TWITTER_STATUS_PATH_PATTERN = /^\/([^/?#]+)\/status\/(\d+)/iu

export type AutoembedService =
  | { type: 'twitter'; statusID: string }
  | { type: 'instagram' }
  | { type: 'reddit' }

export interface AutoembedLink {
  rewritten: string
  service: AutoembedService
  url: string
}

export function findAutoembedLinks(content: string): Array<AutoembedLink> {
  const links: Array<AutoembedLink> = []

  for (const matched of content.matchAll(AUTOEMBED_URL_PATTERN)) {
    const rawURL = matched[0]
    const host = matched.groups?.host.toLowerCase()
    if (!rawURL || !host) continue

    const url = cleanURL(rawURL)
    const service = serviceForURL(host, url)
    if (service === undefined) {
      continue
    }

    const rewritten = replaceHost(url, replacementHost(service))
    if (links.some((link) => link.url === url)) {
      continue
    }

    links.push({ rewritten, service, url })
  }

  return links
}

function serviceForURL(host: string, url: string): AutoembedService | undefined {
  switch (host) {
    case 'twitter.com':
    case 'www.twitter.com':
    case 'mobile.twitter.com':
    case 'x.com':
    case 'www.x.com': {
      const statusID = statusIDFromURL(url)
      return statusID === undefined ? undefined : { statusID, type: 'twitter' }
    }
    case 'instagram.com':
    case 'www.instagram.com':
    case 'kkinstagram.com':
    case 'vxinstagram.com':
    case 'kkclip.com':
    case 'imginn.com':
      return { type: 'instagram' }
    case 'reddit.com':
    case 'www.reddit.com':
    case 'old.reddit.com':
    case 'new.reddit.com':
    case 'np.reddit.com':
    case 'm.reddit.com':
      return { type: 'reddit' }
    default:
      return undefined
  }
}

function replacementHost(service: AutoembedService): string {
  return match(service)
    .returnType<string>()
    .with({ type: 'twitter' }, () => 'fixupx.com')
    .with({ type: 'instagram' }, () => 'vxinstagram.com')
    .with({ type: 'reddit' }, () => 'rxddit.com')
    .exhaustive()
}

function statusIDFromURL(url: string): string | undefined {
  try {
    return TWITTER_STATUS_PATH_PATTERN.exec(new URL(url).pathname)?.[2]
  } catch {
    return undefined
  }
}

function replaceHost(url: string, host: string): string {
  const schemeEnd = url.indexOf('://') + 3
  const pathStart = url.slice(schemeEnd).search(/[/?#]/u)
  const hostEnd = pathStart === -1 ? url.length : schemeEnd + pathStart
  return `${url.slice(0, schemeEnd)}${host}${url.slice(hostEnd)}`
}

function cleanURL(url: string): string {
  return url.replace(/^\|+|\|+$/gu, '').replace(/[)\]>.!,;:]+$/gu, '')
}
