import { expect, test } from 'vite-plus/test'
import { evaluateChimeGate } from '../../src/chime/gate.ts'
import { CHIME_SETTINGS } from '../../src/chime/settings.ts'
import type { ChimeObservation } from '../../src/chime/types.ts'

const MINUTE = 60_000
const NOW = 1_750_000_000_000

function observation(id: string, authorID: string, minutesBefore: number): ChimeObservation {
  return {
    authorID,
    authorName: `user-${authorID}`,
    content: `message ${id}`,
    id,
    timestamp: NOW - minutesBefore * MINUTE
  }
}

/** Six messages from three authors, one minute apart, ending right at now. */
function livelyConversation(): ChimeObservation[] {
  return [
    observation('m1', 'alice', 5),
    observation('m2', 'bob', 4),
    observation('m3', 'alice', 3),
    observation('m4', 'carol', 2),
    observation('m5', 'bob', 1),
    observation('m6', 'alice', 0)
  ]
}

test('is ready when the conversation is lively, unbroken, and off cooldown', () => {
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: livelyConversation() },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict.kind).toBe('ready')
  expect(verdict.kind === 'ready' && verdict.observations).toHaveLength(6)
})

test('holds during the cooldown after a recent chime', () => {
  const verdict = evaluateChimeGate(
    { lastChimeAt: NOW - MINUTE, now: NOW, observations: livelyConversation() },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict).toEqual({ kind: 'hold', reason: 'cooldown' })
})

test('holds when there are too few messages in the window', () => {
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: livelyConversation().slice(4) },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict).toEqual({ kind: 'hold', reason: 'too-quiet' })
})

test('holds when too few distinct people are talking', () => {
  const solo = [
    observation('m1', 'alice', 5),
    observation('m2', 'alice', 4),
    observation('m3', 'alice', 3),
    observation('m4', 'alice', 2),
    observation('m5', 'alice', 1),
    observation('m6', 'alice', 0)
  ]
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: solo },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict).toEqual({ kind: 'hold', reason: 'too-quiet' })
})

test('holds when the flow has a silence longer than the maximum gap', () => {
  const gapped = [
    observation('m1', 'alice', 9),
    observation('m2', 'bob', 8),
    observation('m3', 'carol', 7),
    // A break: the room went quiet far longer than maxGapMs.
    observation('m4', 'alice', 1),
    observation('m5', 'bob', 0.5),
    observation('m6', 'carol', 0)
  ]
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: gapped },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict).toEqual({ kind: 'hold', reason: 'broken-flow' })
})

test('ignores observations that fell out of the liveliness window', () => {
  const staleLead = [
    observation('m1', 'alice', 59),
    observation('m2', 'bob', 58),
    observation('m3', 'carol', 57),
    ...livelyConversation()
  ]
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: staleLead },
    CHIME_SETTINGS,
    () => 0
  )

  expect(verdict.kind).toBe('ready')
  expect(verdict.kind === 'ready' && verdict.observations).toHaveLength(6)
})

test('holds on the dice roll even when everything else passes', () => {
  const verdict = evaluateChimeGate(
    { lastChimeAt: undefined, now: NOW, observations: livelyConversation() },
    CHIME_SETTINGS,
    () => 1
  )

  expect(verdict).toEqual({ kind: 'hold', reason: 'dice' })
})
