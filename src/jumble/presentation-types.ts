import type { CreateMessageOptions, EditMessageOptions, InteractionContent } from 'oceanic.js'
import type { JumbleAction } from './types.ts'

export interface JumbleComponentIds {
  hint: string
  unblur: string
  reshuffle: string
  giveUp: string
  replay: (kind: string) => string
  startSession: string
}

export interface JumblePayloadOptions {
  componentIds: JumbleComponentIds
  image?: Buffer
  action?: JumbleAction
  warning?: string
}

export type JumbleMessagePayload = InteractionContent & CreateMessageOptions & EditMessageOptions

export type JumbleReplayButtonState =
  | { status: 'ready' }
  | { status: 'playing'; userDisplayName: string }
