import type { Message } from 'oceanic.js'
import { handleAutoembeds, isAutoembedMessage } from '../discord/autoembeds.ts'
import { OWNER_USER_ID } from '../discord/ids.ts'
import { isOperationsScope } from '../llm/mintlify-mcp.ts'
import { handleJumbleMessage } from '../jumble/discord.ts'
import { componentIds } from '../jumble/components.ts'
import { modules } from '../modules.ts'
import { setActiveSpanAttributes } from '../observability/tracing.ts'
import type { BotContext } from './context.ts'

export async function handleMessageCreate(context: BotContext, message: Message): Promise<void> {
  if (message.author.bot) {
    setActiveSpanAttributes({ 'kanikou.message.outcome': 'ignored-bot' })
    return
  }

  const guildID = message.guildID

  try {
    if (guildID !== null) {
      const handledByJumble = await handleJumbleMessage(context.client, message, {
        service: context.jumble,
        renderer: context.jumbleRenderer,
        idsFor: (state) => componentIds(state.session.id),
        isEnabled: () =>
          context.moduleStore.isEnabled({
            applicationID: context.applicationID,
            guildID,
            module: modules.jumble.id
          }),
        onImageError: (error) =>
          context.logger.warn('jumble image could not be rendered', { error }),
        onSessionError: (error) =>
          context.logger.warn('jumble session continuation failed', { error })
      })
      if (handledByJumble) {
        setActiveSpanAttributes({ 'kanikou.message.route': 'jumble-guess' })
        return
      }
    }
  } catch (error) {
    context.logger.warn('jumble guess handling failed', { error })
  }

  if (
    guildID !== null &&
    isAutoembedMessage(message.content) &&
    (await context.moduleStore.isEnabled({
      applicationID: context.applicationID,
      guildID,
      module: modules.autoembeds.id
    }))
  ) {
    try {
      await handleAutoembeds(context, message)
    } catch (error) {
      context.logger.warn('autoembed failed', { error })
    }
    setActiveSpanAttributes({ 'kanikou.message.route': 'autoembed' })
    return
  }

  const mentionsBot = message.mentions.users.some((user) => user.id === context.botUserID)

  if (guildID === null && message.author.id === OWNER_USER_ID) {
    setActiveSpanAttributes({ 'kanikou.message.route': 'ai-owner-direct-message' })
    await context.responder.replyToMessage(context, message)
    return
  }

  if (mentionsBot && isOperationsScope({ channelID: message.channelID, guildID })) {
    setActiveSpanAttributes({ 'kanikou.message.route': 'ai-operations-mention' })
    await context.responder.replyToMessage(context, message)
    return
  }

  if (
    guildID !== null &&
    mentionsBot &&
    (await context.moduleStore.isEnabled({
      applicationID: context.applicationID,
      guildID,
      module: modules.ai.id
    }))
  ) {
    setActiveSpanAttributes({ 'kanikou.message.route': 'ai-guild-mention' })
    await context.responder.replyToMessage(context, message)
    return
  }

  setActiveSpanAttributes({ 'kanikou.message.outcome': 'ignored-unmatched' })
}
