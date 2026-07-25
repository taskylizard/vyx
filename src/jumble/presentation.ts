import { ButtonStyles, ComponentTypes } from 'oceanic.js'
import type { InteractionContent, MessageActionRow, TextButton } from 'oceanic.js'
import { PIXELATION_LEVELS } from './renderer.ts'
import type { JumbleAction, JumbleState } from './service.ts'

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
  if (session.endedAt !== null) {
    const outcome =
      session.outcome === 'won'
        ? '🎉 Solved!'
        : session.outcome === 'gave_up'
          ? '🏳️ Game over.'
          : '⏰ Time is up.'
    const artist =
      session.artistName === null ? '' : `\nArtist: **${safeInline(session.artistName)}**`
    const elapsed =
      session.outcome === 'won'
        ? `\nSolved in **${((session.endedAt - session.startedAt) / 1_000).toFixed(1)}s**.`
        : ''
    return `${outcome} **${name} Jumble**\nAnswer: **${safeInline(session.answer)}**${artist}${elapsed}`
  }

  const lines = [
    `**${name} Jumble**`,
    session.metadata.shuffledAnswer !== undefined
      ? `Unscramble: **${safeInline(session.metadata.shuffledAnswer)}**`
      : `What ${session.kind} is hidden in the pixels and scrambled text?`
  ]
  if (action === 'incorrect') lines.push('❌ Not quite — keep guessing!')
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
  if (hiddenHints) {
    buttons.push(button('Add hint', ids.hint, ButtonStyles.PRIMARY))
  } else if (
    state.session.imageUrl !== null &&
    state.session.blurStage < PIXELATION_LEVELS.length - 1
  ) {
    buttons.push(button('Unblur', ids.unblur, ButtonStyles.SECONDARY))
  }
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

function kindName(kind: string): string {
  return kind === 'artist' ? 'Artist' : kind === 'album' ? 'Album' : 'Track'
}

function safeInline(value: string): string {
  return value
    .replace(/[\\`*_~|]/gu, '\\$&')
    .replace(/@/gu, '@\u200b')
    .slice(0, 180)
}
