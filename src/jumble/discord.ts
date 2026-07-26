import type { Client, EditMessageOptions, Message, Permission } from 'oceanic.js'
import { match } from 'ts-pattern'
import { JumbleImageRenderer } from './renderer.ts'
import {
  buildJumblePayload,
  buildJumbleWinnerAnnouncement,
  type JumbleComponentIds
} from './presentation.ts'
import type { JumbleAction, JumbleState } from './types.ts'
import type { JumbleService } from './service.ts'

export interface JumbleComponentIdFactory {
  hint(sessionId: string): string
  unblur(sessionId: string): string
  reshuffle(sessionId: string): string
  giveUp(sessionId: string): string
  replay(kind: string): string
}

export interface RenderedJumble {
  payload: ReturnType<typeof buildJumblePayload>
  imageError?: Error
}

export async function renderJumble(
  state: JumbleState,
  renderer: JumbleImageRenderer,
  ids: JumbleComponentIds,
  action?: JumbleAction
): Promise<RenderedJumble> {
  let image: Buffer | undefined
  let imageError: Error | undefined
  if (state.session.imageUrl !== null) {
    try {
      image =
        state.session.endedAt === null
          ? await renderer.render(state.session.imageUrl, state.session.blurStage)
          : await renderer.reveal(state.session.imageUrl)
    } catch (error) {
      imageError = error instanceof Error ? error : new Error(String(error))
    }
  }
  const payload = buildJumblePayload(state, { componentIds: ids, image, action })
  if (imageError !== undefined && typeof payload.content === 'string') {
    payload.content += '\n\n⚠️ The cover art could not be loaded. Hints and guesses still work.'
  }
  return { payload, imageError }
}

export function jumblePermissionError(interaction: {
  guildID: string | null
  appPermissions: Pick<Permission, 'has'>
}): string | null {
  if (interaction.guildID === null) return null

  const missing: string[] = []
  if (!interaction.appPermissions.has('VIEW_CHANNEL')) missing.push('View Channel')
  if (
    !interaction.appPermissions.has('SEND_MESSAGES') &&
    !interaction.appPermissions.has('SEND_MESSAGES_IN_THREADS')
  ) {
    missing.push('Send Messages')
  }
  if (!interaction.appPermissions.has('READ_MESSAGE_HISTORY')) missing.push('Read Message History')
  if (!interaction.appPermissions.has('ADD_REACTIONS')) missing.push('Add Reactions')
  if (!interaction.appPermissions.has('ATTACH_FILES')) missing.push('Attach Files')
  if (missing.length === 0) return null

  return `Kanikou needs the following permissions in this channel before starting Jumble: **${missing.join(', ')}**.`
}

export async function editJumbleMessage(
  client: Client,
  channelId: string,
  messageId: string,
  rendered: RenderedJumble
): Promise<void> {
  await client.rest.channels.editMessage(
    channelId,
    messageId,
    rendered.payload as EditMessageOptions
  )
}

/** Handle free-text guesses while a channel has an active game. */
export async function handleJumbleMessage(
  client: Client,
  message: Message,
  service: JumbleService,
  renderer: JumbleImageRenderer,
  idsFor: (state: JumbleState) => JumbleComponentIds,
  isEnabled?: () => Promise<boolean>
): Promise<boolean> {
  if (message.author.bot || message.content.trim().length === 0) return false
  const active = await service.activeForChannel(message.channelID)
  if (active === null) return false
  if (isEnabled !== undefined && !(await isEnabled())) return false

  const result = await service.submitGuess(active.session.id, message.author.id, message.content)
  const renderFinished = async (action: 'won' | 'expired' | 'gave_up'): Promise<void> => {
    const rendered = await renderJumble(result.state, renderer, idsFor(result.state), action)
    if (result.state.session.messageId !== null) {
      await editJumbleMessage(
        client,
        result.state.session.channelId,
        result.state.session.messageId,
        rendered
      )
    }
  }
  await match(result.action)
    .with('incorrect', async () => safeReaction(message, '❌'))
    .with('won', async (action) => {
      await renderFinished(action)
      await client.rest.channels.createMessage(message.channelID, {
        allowedMentions: {
          everyone: false,
          repliedUser: false,
          roles: false,
          users: [message.author.id]
        },
        content: buildJumbleWinnerAnnouncement(result.state, message.author.id),
        messageReference: {
          channelID: message.channelID,
          failIfNotExists: false,
          guildID: message.guildID ?? undefined,
          messageID: message.id
        }
      })
      await safeReaction(message, '✅')
    })
    .with('expired', 'gave_up', renderFinished)
    .with('started', 'updated', 'unchanged', async () => undefined)
    .exhaustive()
  return true
}

async function safeReaction(message: Message, emoji: string): Promise<void> {
  try {
    await message.createReaction(emoji)
  } catch {
    // tasky: reactions are optional, so missing permission can't break the guess path.
  }
}
