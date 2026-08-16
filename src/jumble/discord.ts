import type { Client, Message } from 'oceanic.js'
import { match } from 'ts-pattern'
import { replyMessageReference, suppressAllMentions } from '../discord/message-options.ts'
import { safeCreateMessage, safeCreateReaction, safeEditMessage } from '../discord/safe-actions.ts'
import { mergeImageUrlLists } from './candidate.ts'
import { JumbleImageRenderer } from './renderer.ts'
import {
  buildJumblePayload,
  buildJumbleWinnerAnnouncement,
  type JumbleComponentIds
} from './presentation.ts'
import { JumbleError, type JumbleService } from './service.ts'
import type { JumbleAction, JumbleActionResult, JumbleState } from './types.ts'
import { startJumbleTyping } from './typing.ts'

export interface JumbleComponentIdFactory {
  hint(sessionId: string): string
  unblur(sessionId: string): string
  reshuffle(sessionId: string): string
  giveUp(sessionId: string): string
  replay(kind: string): string
  startSession(sessionId: string): string
}

export interface RenderedJumble {
  payload: ReturnType<typeof buildJumblePayload>
  imageError?: Error
}

export interface HandleJumbleMessageOptions {
  service: JumbleService
  renderer: JumbleImageRenderer
  idsFor: (state: JumbleState) => JumbleComponentIds
  isEnabled?: () => Promise<boolean>
  onImageError?: (error: Error) => void
  onSessionError?: (error: unknown) => void
}

export async function renderJumble(
  state: JumbleState,
  renderer: JumbleImageRenderer,
  ids: JumbleComponentIds,
  action?: JumbleAction
): Promise<RenderedJumble> {
  let image: Buffer | undefined
  let imageError: Error | undefined
  const imageUrls = mergeImageUrlLists(
    state.session.imageUrl === null ? undefined : [state.session.imageUrl],
    state.session.metadata.candidate.imageUrl === undefined
      ? undefined
      : [state.session.metadata.candidate.imageUrl],
    state.session.metadata.candidate.imageUrls
  )
  if (imageUrls.length > 0) {
    try {
      image =
        state.session.endedAt === null
          ? imageUrls.length === 1
            ? await renderer.render(imageUrls[0], state.session.blurStage)
            : await renderer.renderWithFallback(imageUrls, state.session.blurStage)
          : imageUrls.length === 1
            ? await renderer.reveal(imageUrls[0])
            : await renderer.revealWithFallback(imageUrls)
    } catch (error) {
      imageError = error instanceof Error ? error : new Error(String(error))
    }
  }
  const payload = buildJumblePayload(state, {
    componentIds: ids,
    image,
    action,
    warning:
      imageError === undefined
        ? undefined
        : '⚠️ The cover art could not be loaded. Hints and guesses still work.'
  })
  return { payload, imageError }
}

export async function createJumbleGameMessage(
  client: Pick<Client, 'getChannel' | 'rest'>,
  result: JumbleActionResult,
  renderer: JumbleImageRenderer,
  ids: JumbleComponentIds
): Promise<{ message: Message; imageError?: Error }> {
  const rendered = await renderJumble(result.state, renderer, ids, result.action)
  const message = await safeCreateMessage(client, result.state.session.channelId, rendered.payload)
  return rendered.imageError === undefined
    ? { message }
    : { imageError: rendered.imageError, message }
}

/** Handle free-text guesses while a channel has an active game. */
export async function handleJumbleMessage(
  client: Client,
  message: Message,
  options: HandleJumbleMessageOptions
): Promise<boolean> {
  const { service, renderer, idsFor, isEnabled } = options
  if (message.author.bot || message.content.trim().length === 0) return false
  const active = await service.activeForChannel(message.channelID)
  if (active === null) return false
  if (isEnabled !== undefined && !(await isEnabled())) return false

  const renderFinished = async (
    result: JumbleActionResult,
    action: 'won' | 'expired' | 'gave_up' | 'cancelled'
  ): Promise<void> => {
    const rendered = await renderJumble(result.state, renderer, idsFor(result.state), action)
    if (result.state.session.messageId !== null) {
      await safeEditMessage(
        client,
        result.state.session.channelId,
        result.state.session.messageId,
        rendered.payload
      )
    }
  }

  if (
    active.session.metadata.continuousSession !== undefined &&
    message.content.trim().toLowerCase() === 'cancel'
  ) {
    const cancelled = await service.cancelContinuousSession(active.session.id)
    await renderFinished(cancelled, 'cancelled')
    await safeCreateReaction(message, '🛑')
    return true
  }

  const result = await service.submitGuess(active.session.id, message.author.id, message.content)
  await match(result.action)
    .with('won', async (action) => {
      await renderFinished(result, action)
      await safeCreateMessage(client, message.channelID, {
        allowedMentions: {
          ...suppressAllMentions,
          users: [message.author.id]
        },
        content: buildJumbleWinnerAnnouncement(result.state, message.author.id),
        messageReference: replyMessageReference(message)
      })
      await safeCreateReaction(message, '✅')
      if (result.state.session.metadata.continuousSession !== undefined) {
        await continueJumbleSession(client, result.state, options)
      }
    })
    .with('expired', 'gave_up', 'cancelled', async (action) => renderFinished(result, action))
    .with('incorrect', 'started', 'updated', 'unchanged', async () => undefined)
    .exhaustive()
  return true
}

async function continueJumbleSession(
  client: Client,
  completed: JumbleState,
  options: HandleJumbleMessageOptions
): Promise<void> {
  const stopTyping = startJumbleTyping(client, completed.session.channelId)
  let startedSessionId: string | undefined
  try {
    const next = await options.service.continueContinuousSession(completed.session.id)
    if (next === null) return
    startedSessionId = next.state.session.id
    const created = await createJumbleGameMessage(
      client,
      next,
      options.renderer,
      options.idsFor(next.state)
    )
    if (created.imageError !== undefined) options.onImageError?.(created.imageError)
    try {
      await options.service.attachMessage(next.state.session.id, created.message.id)
    } catch (error) {
      options.onSessionError?.(error)
    }
  } catch (error) {
    if (startedSessionId !== undefined) {
      try {
        await options.service.expire(startedSessionId)
      } catch (expiryError) {
        options.onSessionError?.(expiryError)
      }
    }
    if (error instanceof JumbleError && error.code === 'busy') return

    options.onSessionError?.(error)
    const detail = error instanceof JumbleError ? error.message : 'The next Jumble could not start.'
    try {
      await safeCreateMessage(client, completed.session.channelId, {
        allowedMentions: suppressAllMentions,
        content: `The Jumble session stopped. ${detail}`
      })
    } catch (notificationError) {
      options.onSessionError?.(notificationError)
    }
  } finally {
    stopTyping()
  }
}
