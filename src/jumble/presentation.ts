import { ButtonStyles, ComponentTypes } from 'oceanic.js'
import type { MessageActionRow, TextButton } from 'oceanic.js'
import { match, P } from 'ts-pattern'
import { suppressAllMentions } from '../discord/message-options.ts'
import { PIXELATION_LEVELS } from './renderer.ts'
import type {
  JumbleComponentIds,
  JumbleMessagePayload,
  JumblePayloadOptions,
  JumbleReplayButtonState
} from './presentation-types.ts'
import type { JumbleAction, JumbleKind, JumbleState } from './types.ts'

export type {
  JumbleComponentIds,
  JumbleMessagePayload,
  JumblePayloadOptions,
  JumbleReplayButtonState
} from './presentation-types.ts'

export function buildJumblePayload(
  state: JumbleState,
  options: JumblePayloadOptions
): JumbleMessagePayload {
  const { session } = state
  const imageName = `jumble-${session.id}.png`
  const payload: JumbleMessagePayload = {
    allowedMentions: suppressAllMentions,
    content: buildContent(state, options.action, options.warning),
    components: [buildButtons(state, options.componentIds)],
    files: options.image === undefined ? undefined : [{ contents: options.image, name: imageName }],
    attachments: session.imageUrl === null ? undefined : []
  }
  if (session.endedAt !== null) {
    payload.components = match({
      continuousSession: session.metadata.continuousSession,
      outcome: session.outcome
    })
      .returnType<MessageActionRow[]>()
      .with({ continuousSession: P.nonNullable, outcome: 'won' }, () => [])
      .with({ outcome: 'won' }, () =>
        buildJumbleReplayComponents(
          options.componentIds.replay(session.kind),
          options.componentIds.startSession,
          { status: 'ready' }
        )
      )
      .otherwise(() =>
        buildJumbleReplayComponents(options.componentIds.replay(session.kind), undefined, {
          status: 'ready'
        })
      )
  }
  return payload
}

export function buildJumbleReplayComponents(
  customID: string,
  startSessionCustomID: string | undefined,
  state: JumbleReplayButtonState
): MessageActionRow[] {
  const replayButton = match(state)
    .returnType<TextButton>()
    .with({ status: 'ready' }, () => button('Play again', customID, ButtonStyles.SUCCESS))
    .with({ status: 'playing' }, ({ userDisplayName }) => ({
      ...button(playingButtonLabel(userDisplayName), customID, ButtonStyles.SUCCESS),
      disabled: true
    }))
    .exhaustive()

  const startSessionButton = match({ startSessionCustomID, state })
    .returnType<TextButton | undefined>()
    .with(
      { startSessionCustomID: P.string, state: { status: 'ready' } },
      ({ startSessionCustomID }) =>
        button('Start session', startSessionCustomID, ButtonStyles.PRIMARY)
    )
    .with(
      { startSessionCustomID: P.string, state: { status: 'playing' } },
      ({ startSessionCustomID }) => ({
        ...button('Start session', startSessionCustomID, ButtonStyles.PRIMARY),
        disabled: true
      })
    )
    .otherwise(() => undefined)

  return [
    buildButtonRow(
      startSessionButton === undefined ? [replayButton] : [replayButton, startSessionButton]
    )
  ]
}

export function buildJumbleSessionStartingComponents(
  customID: string,
  userDisplayName: string
): MessageActionRow[] {
  return [
    buildButtonRow([
      {
        ...button(
          actionButtonLabel(userDisplayName, ' started a session!'),
          customID,
          ButtonStyles.PRIMARY
        ),
        disabled: true
      }
    ])
  ]
}

export function buildJumbleWinnerAnnouncement(state: JumbleState, userId: string): string {
  const { session } = state
  const artist = match(session.kind)
    .with('artist', () => '')
    .with('album', 'track', () =>
      session.artistName === null ? '' : ` by ${safeInline(session.artistName)}`
    )
    .exhaustive()

  return `<@${userId}> got it! It was **${safeInline(session.answer)}**${artist}`
}

function buildContent(
  state: JumbleState,
  action: JumbleAction | undefined,
  warning: string | undefined
): string {
  const { session } = state
  const name = kindName(session.kind)
  const { endedAt } = session
  const shownHints = state.hints.filter((hint) => hint.shown)
  const shownHintLines =
    shownHints.length === 0
      ? []
      : ['', '**Hints**', ...shownHints.map((hint) => `• ${hint.content}`)]
  const scrambledLine =
    session.metadata.shuffledAnswer === undefined
      ? undefined
      : `Unscramble: **${safeInline(session.metadata.shuffledAnswer)}**`

  if (endedAt !== null) {
    const outcome = match(session.outcome)
      .with('won', () => `🎉 Solved! **${name} Jumble**`)
      .with('gave_up', () => `🏳️ <@${session.starterUserId}> gave up.`)
      .with('cancelled', () => '🛑 Jumble session cancelled.')
      .with(P.union('expired', null), () => `⏰ Time is up. **${name} Jumble**`)
      .exhaustive()
    const artist =
      session.artistName === null ? '' : `\nArtist: **${safeInline(session.artistName)}**`
    const elapsed = match(session.outcome)
      .with('won', () => `\nSolved in **${((endedAt - session.startedAt) / 1_000).toFixed(1)}s**.`)
      .with(P.union('gave_up', 'expired', 'cancelled', null), () => '')
      .exhaustive()
    const content = [
      `${outcome}\nAnswer: **${safeInline(session.answer)}**${artist}${elapsed}`,
      ...(scrambledLine === undefined ? [] : ['', scrambledLine]),
      ...shownHintLines,
      ...(warning === undefined ? [] : ['', warning])
    ].join('\n')
    const footer = buildSessionFooter(state)
    return footer === undefined ? content : `${content}\n\n${footer}`
  }

  const lines = [
    `**${name} Jumble**`,
    scrambledLine ?? `What ${session.kind} is hidden in the pixels and scrambled text?`
  ]
  const actionLines = match(action)
    .with('incorrect', () => ['❌ Not quite — keep guessing!'])
    .with(
      P.union(
        undefined,
        'started',
        'updated',
        'won',
        'gave_up',
        'expired',
        'cancelled',
        'unchanged'
      ),
      () => []
    )
    .exhaustive()
  lines.push(...actionLines)
  lines.push(...shownHintLines)
  const remaining = state.hints.length - shownHints.length
  if (remaining > 0) lines.push('', `You have ${remaining} hint${remaining === 1 ? '' : 's'} left.`)
  if (warning !== undefined) lines.push('', warning)
  const footer = buildSessionFooter(state)
  if (footer !== undefined) lines.push('', footer)
  return lines.join('\n')
}

function buildButtons(state: JumbleState, ids: JumbleComponentIds): MessageActionRow {
  const buttons: TextButton[] = []
  const hiddenHints = state.hints.some((hint) => !hint.shown)
  const progressionButton = match({
    hiddenHints,
    hasImage: state.session.imageUrl !== null,
    canUnblur: state.session.blurStage < PIXELATION_LEVELS.length - 1
  })
    .with({ hiddenHints: true }, () => button('Add hint', ids.hint, ButtonStyles.PRIMARY))
    .with({ hasImage: true, canUnblur: true }, () =>
      button('Unblur', ids.unblur, ButtonStyles.SECONDARY)
    )
    .otherwise(() => undefined)
  if (progressionButton !== undefined) buttons.push(progressionButton)
  buttons.push(button('Reshuffle', ids.reshuffle, ButtonStyles.SECONDARY))
  if (state.session.metadata.continuousSession === undefined) {
    buttons.push(button('Give up', ids.giveUp, ButtonStyles.DANGER))
  }
  return buildButtonRow(buttons)
}

function buildSessionFooter(state: JumbleState): string | undefined {
  const { session } = state
  if (session.metadata.continuousSession === undefined) {
    return match(session.outcome)
      .with(
        'won',
        () =>
          '-# Start a session to keep new Jumbles coming until inactivity or someone says "cancel".'
      )
      .with(P.union('gave_up', 'expired', 'cancelled', null), () => undefined)
      .exhaustive()
  }

  return match(session.outcome)
    .with(
      null,
      () => '-# Session mode keeps new Jumbles coming until inactivity or someone says "cancel".'
    )
    .with(
      'won',
      () =>
        '-# Session mode is starting the next Jumble; it stops after inactivity or if someone says "cancel".'
    )
    .with('expired', () => '-# The session ended after inactivity.')
    .with('cancelled', () => '-# The session ended because someone said "cancel".')
    .with('gave_up', () => '-# The session ended.')
    .exhaustive()
}

function button(
  label: string,
  customID: string,
  style: ButtonStyles.PRIMARY | ButtonStyles.SECONDARY | ButtonStyles.SUCCESS | ButtonStyles.DANGER
): TextButton {
  return {
    type: ComponentTypes.BUTTON,
    customID,
    label,
    style
  }
}

function buildButtonRow(buttons: readonly TextButton[]): MessageActionRow {
  return {
    type: ComponentTypes.ACTION_ROW,
    components: [...buttons]
  }
}

function kindName(kind: JumbleKind): string {
  return match(kind)
    .with('artist', () => 'Artist')
    .with('album', () => 'Album')
    .with('track', () => 'Track')
    .exhaustive()
}

export function safeInline(value: string): string {
  return value
    .replace(/[\\`*_~|]/gu, '\\$&')
    .replace(/@/gu, '@\u200b')
    .slice(0, 180)
}

function playingButtonLabel(userDisplayName: string): string {
  return actionButtonLabel(userDisplayName, ' is playing!')
}

function actionButtonLabel(userDisplayName: string, suffix: string): string {
  const availableCodeUnits = 80 - suffix.length
  const normalized = userDisplayName.replace(/\s+/gu, ' ').trim() || 'Someone'
  let truncated = ''

  for (const character of normalized) {
    if (truncated.length + character.length > availableCodeUnits) break
    truncated += character
  }

  return `${truncated}${suffix}`
}
