import type { CommandInteraction, EmbedOptions } from 'oceanic.js'
import { match } from 'ts-pattern'
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
  const exceedsContentLimit = content.length > DISCORD_CONTENT_LIMIT

  return match(target)
    .returnType<Promise<void>>()
    .with({ kind: 'interaction' }, async ({ interaction }) => {
      if (exceedsContentLimit) {
        const embed = {
          description: content
        } satisfies EmbedOptions

        await interaction.editOriginal({
          content: null,
          embeds: [embed]
        })
        return
      }

      await interaction.editOriginal({
        content,
        embeds: null
      })
    })
    .with({ kind: 'message' }, async ({ placeholder }) => {
      if (exceedsContentLimit) {
        await editSentMessageWithEmbed(context.client, placeholder, content)
        return
      }

      await editSentMessage(context.client, placeholder, content)
    })
    .exhaustive()
}
