import type { CommandInteraction, EmbedOptions } from 'oceanic.js'
import { match } from 'ts-pattern'
import type { EditMessageClient } from './client-types.ts'
import { editSentMessage, editSentMessageWithEmbed, type SentDiscordMessage } from './replies.ts'

const DISCORD_CONTENT_LIMIT = 2000

interface InteractionResponseContext {
  client?: never
}

interface MessageResponseContext {
  client: EditMessageClient<unknown>
}

export interface InteractionResponseTarget {
  interaction: {
    editOriginal(options: Parameters<CommandInteraction['editOriginal']>[0]): Promise<unknown>
  }
  kind: 'interaction'
}

export interface MessageResponseTarget {
  kind: 'message'
  placeholder: SentDiscordMessage
}

export type ResponseTarget = InteractionResponseTarget | MessageResponseTarget

export function sendResponse(
  context: InteractionResponseContext,
  target: InteractionResponseTarget,
  content: string
): Promise<void>
export function sendResponse(
  context: MessageResponseContext,
  target: MessageResponseTarget,
  content: string
): Promise<void>
export function sendResponse(
  context: MessageResponseContext,
  target: ResponseTarget,
  content: string
): Promise<void>

export async function sendResponse(
  context: InteractionResponseContext | MessageResponseContext,
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
      if (context.client === undefined) {
        throw new Error('A Discord client is required for message response targets.')
      }

      if (exceedsContentLimit) {
        await editSentMessageWithEmbed(context.client, placeholder, content)
        return
      }

      await editSentMessage(context.client, placeholder, content)
    })
    .exhaustive()
}
