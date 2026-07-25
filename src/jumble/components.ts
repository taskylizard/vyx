import { MessageFlags } from 'oceanic.js'
import { button } from '../bot/rosepack.ts'
import { jumblePermissionError, renderJumble } from './discord.ts'
import type { ComponentContext } from 'rosepack'
import type { BotContext } from '../bot/context.ts'
import { isJumbleKind } from './types.ts'
import type { JumbleActionResult } from './service.ts'

export const jumbleHintButton = button({
  customID: 'jumble/hint/:sessionId',
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.revealHint(context.params.sessionId)
    await updateJumbleComponent(context, result)
  },
  onError: handleComponentError
})

export const jumbleUnblurButton = button({
  customID: 'jumble/unblur/:sessionId',
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.unblur(context.params.sessionId)
    await updateJumbleComponent(context, result)
  },
  onError: handleComponentError
})

export const jumbleReshuffleButton = button({
  customID: 'jumble/reshuffle/:sessionId',
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.reshuffle(context.params.sessionId)
    await updateJumbleComponent(context, result)
  },
  onError: handleComponentError
})

export const jumbleGiveUpButton = button({
  customID: 'jumble/give-up/:sessionId',
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.giveUp(
      context.params.sessionId,
      context.interaction.user.id
    )
    await updateJumbleComponent(context, result)
  },
  onError: handleComponentError
})

export const jumbleReplayButton = button({
  customID: 'jumble/replay/:kind',
  async execute(context) {
    await context.deferUpdate()
    const permissionError = jumblePermissionError(context.interaction)
    if (permissionError !== null) throw new Error(permissionError)
    if (!isJumbleKind(context.params.kind)) throw new Error('That Jumble type is not supported.')
    const previous = context.interaction.message
    const result = await context.app.jumble.start({
      starterUserId: context.interaction.user.id,
      guildId: context.interaction.guildID,
      channelId: context.interaction.channelID,
      kind: context.params.kind,
      username: (await context.app.jumble.getProfile(context.interaction.user.id)) ?? undefined
    })
    const attached = await context.app.jumble.attachMessage(result.state.session.id, previous.id)
    const rendered = await renderJumble(
      attached,
      context.app.jumbleRenderer,
      componentIds(attached.session.id),
      result.action
    )
    await context.update(rendered.payload)
  },
  onError: handleComponentError
})

export const jumbleComponents = [
  jumbleHintButton,
  jumbleUnblurButton,
  jumbleReshuffleButton,
  jumbleGiveUpButton,
  jumbleReplayButton
] as const

export function componentIds(sessionId: string) {
  return {
    hint: jumbleHintButton.buildID({ params: { sessionId } }),
    unblur: jumbleUnblurButton.buildID({ params: { sessionId } }),
    reshuffle: jumbleReshuffleButton.buildID({ params: { sessionId } }),
    giveUp: jumbleGiveUpButton.buildID({ params: { sessionId } }),
    replay: (kind: string) => jumbleReplayButton.buildID({ params: { kind } })
  }
}

async function updateJumbleComponent<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button'>,
  result: JumbleActionResult
): Promise<void> {
  const rendered = await renderJumble(
    result.state,
    context.app.jumbleRenderer,
    componentIds(result.state.session.id),
    result.action
  )
  if (rendered.imageError !== undefined) {
    context.app.logger.warn('jumble image could not be rendered', rendered.imageError)
  }
  await context.update(rendered.payload)
}

async function assertComponentSession<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button'>,
  sessionId: string
): Promise<void> {
  const state = await context.app.jumble.getState(sessionId)
  if (
    state.session.channelId !== context.interaction.channelID ||
    (state.session.messageId !== null && state.session.messageId !== context.interaction.message.id)
  ) {
    throw new Error('That control belongs to a different Jumble message.')
  }
}

async function handleComponentError<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button'>,
  error: unknown
): Promise<void> {
  context.app.logger.warn('jumble component failed', error)
  const message = error instanceof Error ? error.message : 'That Jumble action failed.'
  if (context.acknowledged) {
    await context.followUp({ content: message, flags: MessageFlags.EPHEMERAL })
  } else {
    await context.reply({ content: message, flags: MessageFlags.EPHEMERAL })
  }
}
