import { MessageFlags, type MessageActionRow } from 'oceanic.js'
import { match, P } from 'ts-pattern'
import { button } from '../bot/rosepack.ts'
import { createJumbleGameMessage, jumblePermissionError, renderJumble } from './discord.ts'
import {
  buildJumbleReplayComponents,
  buildJumbleSessionStartingComponents
} from './presentation.ts'
import type { ComponentContext } from 'rosepack'
import type { BotContext } from '../bot/context.ts'
import { modules } from '../modules.ts'
import { isJumbleKind, type JumbleActionResult, type JumbleState } from './types.ts'
import { startJumbleTyping } from './typing.ts'

export const jumbleHintButton = button({
  customID: 'jumble/hint/:sessionId',
  beforeExecute: assertJumbleEnabled,
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
  beforeExecute: assertJumbleEnabled,
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
  beforeExecute: assertJumbleEnabled,
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
  beforeExecute: assertJumbleEnabled,
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
  beforeExecute: assertJumbleEnabled,
  async execute(context) {
    const permissionError = jumblePermissionError(context.interaction)
    if (permissionError !== null) throw new Error(permissionError)
    const kind = context.params.kind
    if (!isJumbleKind(kind)) throw new Error('That Jumble type is not supported.')

    const replayCustomID = jumbleReplayButton.buildID({ params: { kind } })
    const userDisplayName =
      context.interaction.member?.displayName ??
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
  },
  onError: handleComponentError
})

export const jumbleStartSessionButton = button({
  customID: 'jumble/session/:sessionId',
  beforeExecute: assertJumbleEnabled,
  async execute(context) {
    const permissionError = jumblePermissionError(context.interaction)
    if (permissionError !== null) throw new Error(permissionError)
    await assertComponentSession(context, context.params.sessionId)

    const customID = jumbleStartSessionButton.buildID({
      params: { sessionId: context.params.sessionId }
    })
    const userDisplayName =
      context.interaction.member?.displayName ??
      context.interaction.user.globalName ??
      context.interaction.user.username
    await startJumbleFromCompletedMessage(context, {
      pendingComponents: buildJumbleSessionStartingComponents(customID, userDisplayName),
      start: () => context.app.jumble.startContinuousSession(context.params.sessionId)
    })
  },
  onError: handleComponentError
})

interface StartJumbleFromCompletedOptions {
  pendingComponents: MessageActionRow[]
  start: () => Promise<JumbleActionResult<'started'>>
}

async function startJumbleFromCompletedMessage<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>,
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
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>,
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
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>,
  sessionId: string
): Promise<JumbleState> {
  const state = await context.app.jumble.getState(sessionId)
  if (
    state.session.channelId !== context.interaction.channelID ||
    (state.session.messageId !== null && state.session.messageId !== context.interaction.message.id)
  ) {
    throw new Error('That control belongs to a different Jumble message.')
  }
  return state
}

async function handleComponentError<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>,
  error: unknown
): Promise<void> {
  context.app.logger.error('jumble component failed', { error })
  const message = match(error)
    .with(P.instanceOf(Error), (value) => value.message)
    .otherwise(() => 'That Jumble action failed.')
  await match(context.acknowledged)
    .with(true, async () => context.followUp({ content: message, flags: MessageFlags.EPHEMERAL }))
    .otherwise(async () => context.reply({ content: message, flags: MessageFlags.EPHEMERAL }))
}

async function assertJumbleEnabled<TRoute extends string>(
  context: ComponentContext<BotContext, TRoute, 'button', typeof modules>
): Promise<void> {
  await match(context.interaction.guildID)
    .with(null, () => {
      throw new Error(
        'Jumble is disabled in this server. Ask the bot owner to enable it with /modules enable.'
      )
    })
    .otherwise(async () => {
      return match(await context.modules.isEnabled(modules.jumble))
        .with(true, () => undefined)
        .otherwise(() => {
          throw new Error(
            'Jumble is disabled in this server. Ask the bot owner to enable it with /modules enable.'
          )
        })
    })
}
