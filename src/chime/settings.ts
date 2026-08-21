import { TASKYLAND_CHATTER_CHANNEL_ID, TASKYLAND_GUILD_ID } from '../discord/ids.ts'
import type { ChimeSettings } from './types.ts'

/** The only place kanikou may spontaneously chime: taskyland's main chatter channel. */
export const CHIME_SCOPE = {
  channelID: TASKYLAND_CHATTER_CHANNEL_ID,
  guildID: TASKYLAND_GUILD_ID
} as const

/**
 * Deliberately rare: a hard cooldown plus a low per-message roll mean kanikou
 * joins an already lively, unbroken conversation at most a couple of times a day.
 */
export const CHIME_SETTINGS = {
  chance: 0.02,
  cooldownMs: 6 * 60 * 60 * 1000,
  maxGapMs: 4 * 60 * 1000,
  maxSendDelayMs: 3000,
  minAuthors: 3,
  minMessages: 6,
  minSendDelayMs: 800,
  windowMs: 10 * 60 * 1000
} as const satisfies ChimeSettings
