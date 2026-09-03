import { match } from 'ts-pattern'
import { sendTextReply, suppressOriginalEmbed } from './discord.ts'
import { sendInstagramAutoembed } from './instagram.tsx'
import { findAutoembedLinks } from './links.ts'
import { sendTwitterAutoembed } from './twitter.tsx'
import type { AutoembedContext, AutoembedMessage } from './types.ts'

export async function handleAutoembeds(
  context: AutoembedContext,
  message: AutoembedMessage
): Promise<void> {
  if (message.content.toLowerCase().includes('-ignore')) {
    return
  }

  const links = findAutoembedLinks(message.content)
  if (links.length === 0) {
    return
  }

  await Promise.all(
    links.map((link) =>
      match(link.service)
        .returnType<Promise<void>>()
        .with({ type: 'reddit' }, () => sendTextReply(context, message, link.rewritten))
        .with({ type: 'twitter' }, { type: 'instagram' }, async (service) => {
          try {
            await match(service)
              .returnType<Promise<void>>()
              .with({ type: 'twitter' }, ({ statusID }) =>
                sendTwitterAutoembed(context, message, link.url, statusID)
              )
              .with({ type: 'instagram' }, () => sendInstagramAutoembed(context, message, link.url))
              .exhaustive()
          } catch (error) {
            context.logger.warn('component autoembed failed', { error, service: service.type })
            await sendTextReply(context, message, link.rewritten)
          }
        })
        .exhaustive()
    )
  )

  await suppressOriginalEmbed(context, message)
}

export function isAutoembedMessage(content: string): boolean {
  return !content.toLowerCase().includes('-ignore') && findAutoembedLinks(content).length > 0
}

export { instagramMessage, instagramMediaMessage } from './instagram.tsx'
export { findAutoembedLinks } from './links.ts'
export { twitterMessage } from './twitter.tsx'
export type { InstagramComponentAssets } from './instagram.tsx'
export type { AutoembedLink, AutoembedService } from './links.ts'
export type { TwitterComponentAssets } from './twitter.tsx'
export type { AutoembedContext, AutoembedMessage } from './types.ts'
