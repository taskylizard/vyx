import { MessageFlags } from 'oceanic.js'
import { match, P } from 'ts-pattern'
import { button } from '../bot/rosepack.ts'
import { createJumbleMessage, jumblePermissionError, renderJumble } from './discord.ts'
import { buildJumbleReplayComponents } from './presentation.ts'
import type { ComponentContext } from 'rosepack'
import type { BotContext } from '../bot/context.ts'
import { modules } from '../modules.ts'
import { isJumbleKind, type JumbleActionResult } from './types.ts'
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
    const readyComponents = buildJumbleReplayComponents(replayCustomID, { status: 'ready' })
    const userDisplayName =
      context.interaction.member?.displayName ??
      context.interaction.user.globalName ??
      context.interaction.user.username
    await context.update({
      components: buildJumbleReplayComponents(replayCustomID, {
        status: 'playing',
        userDisplayName
      })
    })

    const stopTyping = startJumbleTyping(context.client, context.interaction.channelID)
    let startedSessionId: string | undefined
    try {
      const result = await context.app.jumble.start({
        starterUserId: context.interaction.user.id,
        guildId: context.interaction.guildID,
        channelId: context.interaction.channelID,
        kind,
        username: (await context.app.jumble.getProfile(context.interaction.user.id)) ?? undefined
      })
      startedSessionId = result.state.session.id
      const rendered = await renderJumble(
        result.state,
        context.app.jumbleRenderer,
        componentIds(result.state.session.id),
        result.action
      )
      if (rendered.imageError !== undefined) {
        context.app.logger.warn('jumble image could not be rendered', {
          error: rendered.imageError
        })
      }
      const message = await createJumbleMessage(
        context.client,
        context.interaction.channelID,
        rendered.payload
      )
      try {
        await context.app.jumble.attachMessage(result.state.session.id, message.id)
      } catch (error) {
        context.app.logger.warn('jumble message ID could not be saved', { error })
      }
    } catch (error) {
      if (startedSessionId !== undefined) {
        try {
          await context.app.jumble.expire(startedSessionId)
        } catch (expiryError) {
          context.app.logger.warn('failed replay Jumble could not be expired', {
            error: expiryError
          })
        }
      }
      try {
        await context.update({ components: readyComponents })
      } catch (updateError) {
        context.app.logger.warn('jumble replay button could not be restored', {
          error: updateError
        })
      }
      throw error
    } finally {
      stopTyping()
    }
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
