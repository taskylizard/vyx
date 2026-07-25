import { match } from 'ts-pattern'
import type { Message } from 'oceanic.js'
import { handleAutoembeds, isAutoembedMessage } from '../discord/autoembeds.ts'
import { OWNER_USER_ID, TASKYLAND_GUILD_ID } from '../discord/ids.ts'
import { isOperationsScope } from '../llm/mintlify-mcp.ts'
import { handleJumbleMessage } from '../jumble/discord.ts'
import { componentIds } from '../jumble/components.ts'
import { modules } from '../modules.ts'
import type { BotContext } from './context.ts'

export async function handleMessageCreate(context: BotContext, message: Message): Promise<void> {
  if (message.author.bot) {
    return
  }

  try {
    const guildID = message.guildID
    if (guildID !== null && context.moduleStore !== undefined) {
      const handledByJumble = await handleJumbleMessage(
        context.client,
        message,
        context.jumble,
        context.jumbleRenderer,
        (state) => componentIds(state.session.id),
        () =>
          context.moduleStore.isEnabled({
            applicationID: context.applicationID,
            guildID,
            module: modules.jumble.id
          })
      )
      if (handledByJumble) return
    }
  } catch (error) {
    context.logger.warn('jumble guess handling failed', error)
  }

  if (message.guildID === TASKYLAND_GUILD_ID) {
    const shouldIgnoreAI = isAutoembedMessage(message.content)
    try {
      await handleAutoembeds(context, message)
    } catch (error) {
      context.logger.warn('autoembed failed', error)
    }
    if (shouldIgnoreAI) {
      return
    }
  }

  await match({
    isOwnerDirectMessage: message.guildID === null && message.author.id === OWNER_USER_ID,
    isOperationsChannel: isOperationsScope({
      channelID: message.channelID,
      guildID: message.guildID
    }),
    isTaskyland: message.guildID === TASKYLAND_GUILD_ID,
    mentionsBot: message.mentions.users.some((user) => user.id === context.botUserID)
  })
    .with({ isOwnerDirectMessage: true }, async () => {
      await context.responder.replyToMessage(context, message)
    })
    .with({ isOperationsChannel: true, mentionsBot: true }, async () => {
      await context.responder.replyToMessage(context, message)
    })
    .with({ isTaskyland: true, mentionsBot: true }, async () => {
      await context.responder.replyToMessage(context, message)
    })
    .otherwise(async () => undefined)
}
