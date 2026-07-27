import type { Message } from 'oceanic.js'
import { match } from 'ts-pattern'
import type { BotContext } from '../../bot/context.ts'
import { sendTextReply, suppressOriginalEmbed } from './discord.ts'
import { sendInstagramAutoembed } from './instagram.ts'
import { findAutoembedLinks } from './links.ts'
import { sendTwitterAutoembed } from './twitter.ts'

export async function handleAutoembeds(context: BotContext, message: Message): Promise<void> {
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

export { instagramComponents } from './instagram.ts'
export { findAutoembedLinks } from './links.ts'
export { twitterComponents } from './twitter.ts'
export type { InstagramComponentAssets } from './instagram.ts'
export type { AutoembedLink, AutoembedService } from './links.ts'
export type { TwitterComponentAssets } from './twitter.ts'
