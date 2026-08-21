import { unique } from 'radashi'
import type { ChimeObservation, ChimeSettings } from './types.ts'

export type ChimeHoldReason = 'broken-flow' | 'cooldown' | 'dice' | 'too-quiet'

export type ChimeGateVerdict =
  | {
      kind: 'hold'
      reason: ChimeHoldReason
    }
  | {
      kind: 'ready'
      /** The qualifying window of observations the verdict was computed from. */
      observations: readonly ChimeObservation[]
    }

export interface ChimeGateSnapshot {
  /** Epoch milliseconds of the last chime in this channel, if one happened. */
  readonly lastChimeAt: number | undefined
  readonly now: number

  /**
   * Human observations for one channel in ascending timestamp order, as
   * maintained by the watcher.
   */
  readonly observations: readonly ChimeObservation[]
}

/**
 * Decides whether kanikou may chime into a conversation. Every condition is
 * pure and deterministic except the final roll, which is injected so tests and
 * callers control randomness.
 */
export function evaluateChimeGate(
  snapshot: ChimeGateSnapshot,
  settings: ChimeSettings,
  roll: () => number
): ChimeGateVerdict {
  const { lastChimeAt, now, observations } = snapshot

  if (lastChimeAt !== undefined && now - lastChimeAt < settings.cooldownMs) {
    return { kind: 'hold', reason: 'cooldown' }
  }

  const recent = observations.filter(
    (observation) => now - observation.timestamp <= settings.windowMs
  )

  if (recent.length < settings.minMessages) {
    return { kind: 'hold', reason: 'too-quiet' }
  }

  if (unique(recent.map((observation) => observation.authorID)).length < settings.minAuthors) {
    return { kind: 'hold', reason: 'too-quiet' }
  }

  // A single silence longer than maxGapMs means the conversation had a break;
  // kanikou only joins flows that have been continuous end to end.
  for (let index = 1; index < recent.length; index += 1) {
    const gap = recent[index].timestamp - recent[index - 1].timestamp
    if (gap > settings.maxGapMs) {
      return { kind: 'hold', reason: 'broken-flow' }
    }
  }

  return roll() < settings.chance
    ? { kind: 'ready', observations: recent }
    : { kind: 'hold', reason: 'dice' }
}
