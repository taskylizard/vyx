import { ButtonStyles, ComponentTypes } from 'oceanic.js'
import type { InteractionContent, MessageActionRow, TextButton } from 'oceanic.js'
import { match } from 'ts-pattern'
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
    payload.components = [
      buildButtonRow([
        button('Play again', options.componentIds.replay(session.kind), ButtonStyles.SUCCESS)
      ])
    ]
  return payload
}

function buildContent(state: JumbleState, action: JumbleAction | undefined): string {
  const { session } = state
  const name = kindName(session.kind)
  const { endedAt } = session
  if (endedAt !== null) {
    const outcome = match(session.outcome)
      .with('won', () => '🎉 Solved!')
      .with('gave_up', () => '🏳️ Game over.')
      .otherwise(() => '⏰ Time is up.')
    const artist =
      session.artistName === null ? '' : `\nArtist: **${safeInline(session.artistName)}**`
    const elapsed = match(session.outcome)
      .with('won', () => `\nSolved in **${((endedAt - session.startedAt) / 1_000).toFixed(1)}s**.`)
      .otherwise(() => '')
    return `${outcome} **${name} Jumble**\nAnswer: **${safeInline(session.answer)}**${artist}${elapsed}`
  }

  const lines = [
    `**${name} Jumble**`,
    session.metadata.shuffledAnswer !== undefined
      ? `Unscramble: **${safeInline(session.metadata.shuffledAnswer)}**`
      : `What ${session.kind} is hidden in the pixels and scrambled text?`
  ]
  const actionLines = match(action)
    .with('incorrect', () => ['❌ Not quite — keep guessing!'])
    .otherwise(() => [])
  lines.push(...actionLines)
  const shownHints = state.hints.filter((hint) => hint.shown)
  if (shownHints.length > 0) {
    lines.push('', '**Hints**', ...shownHints.map((hint) => `• ${hint.content}`))
  }
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
