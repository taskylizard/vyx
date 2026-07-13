import type { Message } from 'oceanic.js'
import type { BotContext } from '../../bot/context.ts'
import { sendTextReply, suppressOriginalEmbed } from './discord.ts'
import { sendInstagramAutoembed } from './instagram.ts'
import { findAutoembedLinks } from './links.ts'
import { sendTwitterAutoembed } from './twitter.ts'

export async function handleAutoembeds(context: BotContext, message: Message): Promise<void> {
  if (!isAutoembedMessage(message.content)) {
    return
  }

  const links = findAutoembedLinks(message.content)
  if (links.length === 0) {
    return
  }

  for (const link of links) {
    switch (link.service.type) {
      case 'twitter':
        try {
          await sendTwitterAutoembed(context, message, link.url, link.service.statusID)
        } catch (error) {
          context.logger.warn('twitter component autoembed failed', error)
          await sendTextReply(context, message, link.rewritten)
        }
        break
      case 'instagram':
        try {
          await sendInstagramAutoembed(context, message, link.url)
        } catch (error) {
          context.logger.warn('instagram component autoembed failed', error)
          await sendTextReply(context, message, link.rewritten)
        }
        break
      case 'reddit':
        await sendTextReply(context, message, link.rewritten)
        break
    }
  }

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
