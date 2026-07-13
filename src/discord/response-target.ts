import type { CommandInteraction, EmbedOptions } from 'oceanic.js'
import type { BotContext } from '../bot/context.ts'
import { editSentMessage, editSentMessageWithEmbed, type SentDiscordMessage } from './replies.ts'

const DISCORD_CONTENT_LIMIT = 2000

export type ResponseTarget =
  | {
      interaction: CommandInteraction
      kind: 'interaction'
    }
  | {
      kind: 'message'
      placeholder: SentDiscordMessage
    }

export async function sendResponse(
  context: BotContext,
  target: ResponseTarget,
  content: string
): Promise<void> {
  if (target.kind === 'interaction') {
    if (content.length > DISCORD_CONTENT_LIMIT) {
      const embed = {
        description: content
      } satisfies EmbedOptions

      await target.interaction.editOriginal({
        content: null,
        embeds: [embed]
      })
      return
    }

    await target.interaction.editOriginal({
      content,
      embeds: null
    })
    return
  }

  if (content.length > DISCORD_CONTENT_LIMIT) {
    await editSentMessageWithEmbed(context.client, target.placeholder, content)
    return
  }

  await editSentMessage(context.client, target.placeholder, content)
}
