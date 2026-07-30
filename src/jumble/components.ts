import { MessageFlags, type MessageActionRow } from 'oceanic.js'
import { match } from 'ts-pattern'
import { button } from '../bot/rosepack.ts'
import { createJumbleGameMessage, renderJumble } from './discord.ts'
import { jumbleErrorMessage } from './errors.ts'
import {
  buildJumbleReplayComponents,
  buildJumbleSessionStartingComponents
} from './presentation.ts'
import type { ComponentContext, GuardedContext } from 'rosepack'
import type { BotContext } from '../bot/context.ts'
import { modules } from '../modules.ts'
import { jumbleComponentGuards, jumbleStartGuards } from './guards.ts'
import { JumbleError } from './service.ts'
import { isJumbleKind, type JumbleActionResult, type JumbleState } from './types.ts'
import { startJumbleTyping } from './typing.ts'

type JumbleComponentContext<TRoute extends string> = GuardedContext<
  ComponentContext<BotContext, TRoute, 'button', typeof modules>,
  typeof jumbleComponentGuards
>

export const jumbleHintButton = button({
  customID: 'jumble/hint/:sessionId',
  guards: jumbleComponentGuards,
  onError: handleComponentError,
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.revealHint(context.params.sessionId)
    await updateJumbleComponent(context, result)
  }
})

export const jumbleUnblurButton = button({
  customID: 'jumble/unblur/:sessionId',
  guards: jumbleComponentGuards,
  onError: handleComponentError,
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.unblur(context.params.sessionId)
    await updateJumbleComponent(context, result)
  }
})

export const jumbleReshuffleButton = button({
  customID: 'jumble/reshuffle/:sessionId',
  guards: jumbleComponentGuards,
  onError: handleComponentError,
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.reshuffle(context.params.sessionId)
    await updateJumbleComponent(context, result)
  }
})

export const jumbleGiveUpButton = button({
  customID: 'jumble/give-up/:sessionId',
  guards: jumbleComponentGuards,
  onError: handleComponentError,
  async execute(context) {
    await context.deferUpdate()
    await assertComponentSession(context, context.params.sessionId)
    const result = await context.app.jumble.giveUp(
      context.params.sessionId,
      context.interaction.user.id
    )
    await updateJumbleComponent(context, result)
  }
})

export const jumbleReplayButton = button({
  customID: 'jumble/replay/:kind',
  guards: jumbleStartGuards,
  onError: handleComponentError,
  async execute(context) {
    const kind = context.params.kind
    if (!isJumbleKind(kind)) {
      throw new JumbleError('That Jumble type is not supported.', 'not-supported')
    }

    const replayCustomID = jumbleReplayButton.buildID({ params: { kind } })
    const userDisplayName =
      context.interaction.member.displayName ??
      context.interaction.user.globalName ??
      context.interaction.user.username
    await startJumbleFromCompletedMessage(context, {
      pendingComponents: buildJumbleReplayComponents(replayCustomID, undefined, {
        status: 'playing',
        userDisplayName
      }),
      start: () =>
        context.app.jumble.start({
          starterUserId: context.interaction.user.id,
          guildId: context.interaction.guildID,
          channelId: context.interaction.channelID,
          kind
        })
    })
  }
})

export const jumbleStartSessionButton = button({
  customID: 'jumble/session/:sessionId',
  guards: jumbleStartGuards,
  onError: handleComponentError,
  async execute(context) {
    await assertComponentSession(context, context.params.sessionId)

    const customID = jumbleStartSessionButton.buildID({
      params: { sessionId: context.params.sessionId }
    })
    const userDisplayName =
      context.interaction.member.displayName ??
      context.interaction.user.globalName ??
      context.interaction.user.username
    await startJumbleFromCompletedMessage(context, {
      pendingComponents: buildJumbleSessionStartingComponents(customID, userDisplayName),
      start: () => context.app.jumble.startContinuousSession(context.params.sessionId)
    })
  }
})

interface StartJumbleFromCompletedOptions {
  pendingComponents: MessageActionRow[]
  start: () => Promise<JumbleActionResult<'started'>>
}

async function startJumbleFromCompletedMessage<TRoute extends string>(
  context: JumbleComponentContext<TRoute>,
  options: StartJumbleFromCompletedOptions
): Promise<void> {
  const readyComponents = context.interaction.message.components
  await context.update({ components: options.pendingComponents })

  const stopTyping = startJumbleTyping(context.client, context.interaction.channelID)
  let startedSessionId: string | undefined
  try {
    const result = await options.start()
    startedSessionId = result.state.session.id
    const created = await createJumbleGameMessage(
      context.client,
      result,
      context.app.jumbleRenderer,
      componentIds(result.state.session.id)
    )
    if (created.imageError !== undefined) {
      context.app.logger.warn('jumble image could not be rendered', {
        error: created.imageError
      })
    }
    try {
      await context.app.jumble.attachMessage(result.state.session.id, created.message.id)
    } catch (error) {
      context.app.logger.warn('jumble message ID could not be saved', { error })
    }
  } catch (error) {
    if (startedSessionId !== undefined) {
      try {
        await context.app.jumble.expire(startedSessionId)
      } catch (expiryError) {
        context.app.logger.warn('failed component-started Jumble could not be expired', {
          error: expiryError
        })
      }
    }
    try {
      await context.update({ components: readyComponents })
    } catch (updateError) {
      context.app.logger.warn('jumble completion buttons could not be restored', {
        error: updateError
      })
    }
    throw error
  } finally {
    stopTyping()
  }
}

export const jumbleComponents = [
  jumbleHintButton,
  jumbleUnblurButton,
  jumbleReshuffleButton,
  jumbleGiveUpButton,
  jumbleReplayButton,
  jumbleStartSessionButton
] as const

export function componentIds(sessionId: string) {
  return {
    hint: jumbleHintButton.buildID({ params: { sessionId } }),
    unblur: jumbleUnblurButton.buildID({ params: { sessionId } }),
    reshuffle: jumbleReshuffleButton.buildID({ params: { sessionId } }),
    giveUp: jumbleGiveUpButton.buildID({ params: { sessionId } }),
    replay: (kind: string) => jumbleReplayButton.buildID({ params: { kind } }),
    startSession: jumbleStartSessionButton.buildID({ params: { sessionId } })
  }
}

async function updateJumbleComponent<TRoute extends string>(
  context: JumbleComponentContext<TRoute>,
  result: JumbleActionResult
): Promise<void> {
  const rendered = await renderJumble(
    result.state,
    context.app.jumbleRenderer,
    componentIds(result.state.session.id),
    result.action
  )
  if (rendered.imageError !== undefined) {
    context.app.logger.warn('jumble image could not be rendered', { error: rendered.imageError })
  }
  await context.update(rendered.payload)
}

async function assertComponentSession<TRoute extends string>(
  context: JumbleComponentContext<TRoute>,
  sessionId: string
): Promise<JumbleState> {
  const state = await context.app.jumble.getState(sessionId)
  if (
    state.session.channelId !== context.interaction.channelID ||
    (state.session.messageId !== null && state.session.messageId !== context.interaction.message.id)
  ) {
    throw new JumbleError('That control belongs to a different Jumble message.', 'forbidden')
  }
  return state
}

async function handleComponentError<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>,
  error: unknown
): Promise<void> {
  context.app.logger.error('jumble component failed', { error })
  const message = jumbleErrorMessage(error, 'Could not update Jumble. Try again.')
  await match(context.acknowledged)
    .with(true, async () => context.followUp({ content: message, flags: MessageFlags.EPHEMERAL }))
    .otherwise(async () => context.reply({ content: message, flags: MessageFlags.EPHEMERAL }))
}
