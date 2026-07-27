import { ButtonStyles, ComponentTypes } from 'oceanic.js'
import type { InteractionContent, MessageActionRow, TextButton } from 'oceanic.js'
import { match, P } from 'ts-pattern'
import { PIXELATION_LEVELS } from './renderer.ts'
import type { JumbleAction, JumbleKind, JumbleState } from './types.ts'

export interface JumbleComponentIds {
  hint: string
  unblur: string
  reshuffle: string
  giveUp: string
  replay: (kind: string) => string
}

export interface JumblePayloadOptions {
  componentIds: JumbleComponentIds
  image?: Buffer
  action?: JumbleAction
}

export type JumbleReplayButtonState =
  | { status: 'ready' }
  | { status: 'playing'; userDisplayName: string }

export function buildJumblePayload(
  state: JumbleState,
  options: JumblePayloadOptions
): InteractionContent {
  const { session } = state
  const imageName = `jumble-${session.id}.png`
  const payload: InteractionContent = {
    allowedMentions: {
      everyone: false,
      repliedUser: false,
      roles: false,
      users: false
    },
    content: buildContent(state, options.action),
    components: [buildButtons(state, options.componentIds)],
    files: options.image === undefined ? undefined : [{ contents: options.image, name: imageName }],
    attachments: session.imageUrl === null ? undefined : []
  }
  if (session.endedAt !== null)
    payload.components = buildJumbleReplayComponents(options.componentIds.replay(session.kind), {
      status: 'ready'
    })
  return payload
}

export function buildJumbleReplayComponents(
  customID: string,
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

  return [buildButtonRow([replayButton])]
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

function buildContent(state: JumbleState, action: JumbleAction | undefined): string {
  const { session } = state
  const name = kindName(session.kind)
  const { endedAt } = session
  const shownHints = state.hints.filter((hint) => hint.shown)
  const shownHintLines =
    shownHints.length === 0
      ? []
      : ['', '**Hints**', ...shownHints.map((hint) => `• ${hint.content}`)]

  if (endedAt !== null) {
    const outcome = match(session.outcome)
      .with('won', () => `🎉 Solved! **${name} Jumble**`)
      .with('gave_up', () => `🏳️ <@${session.starterUserId}> gave up.`)
      .with(P.union('expired', null), () => `⏰ Time is up. **${name} Jumble**`)
      .exhaustive()
    const artist =
      session.artistName === null ? '' : `\nArtist: **${safeInline(session.artistName)}**`
    const elapsed = match(session.outcome)
      .with('won', () => `\nSolved in **${((endedAt - session.startedAt) / 1_000).toFixed(1)}s**.`)
      .with(P.union('gave_up', 'expired', null), () => '')
      .exhaustive()
    return [
      `${outcome}\nAnswer: **${safeInline(session.answer)}**${artist}${elapsed}`,
      ...shownHintLines
    ].join('\n')
  }

  const lines = [
    `**${name} Jumble**`,
    session.metadata.shuffledAnswer !== undefined
      ? `Unscramble: **${safeInline(session.metadata.shuffledAnswer)}**`
      : `What ${session.kind} is hidden in the pixels and scrambled text?`
  ]
  const actionLines = match(action)
    .with('incorrect', () => ['❌ Not quite — keep guessing!'])
    .with(
      P.union(undefined, 'started', 'updated', 'won', 'gave_up', 'expired', 'unchanged'),
      () => []
    )
    .exhaustive()
  lines.push(...actionLines)
  lines.push(...shownHintLines)
  const remaining = state.hints.length - shownHints.length
  if (remaining > 0) lines.push('', `You have ${remaining} hint${remaining === 1 ? '' : 's'} left.`)
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
  buttons.push(button('Give up', ids.giveUp, ButtonStyles.DANGER))
  return buildButtonRow(buttons)
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

function safeInline(value: string): string {
  return value
    .replace(/[\\`*_~|]/gu, '\\$&')
    .replace(/@/gu, '@\u200b')
    .slice(0, 180)
}

function playingButtonLabel(userDisplayName: string): string {
  const suffix = ' is playing!'
  const availableCodeUnits = 80 - suffix.length
  const normalized = userDisplayName.replace(/\s+/gu, ' ').trim() || 'Someone'
  let truncated = ''

  for (const character of normalized) {
    if (truncated.length + character.length > availableCodeUnits) break
    truncated += character
  }

  return `${truncated}${suffix}`
}
