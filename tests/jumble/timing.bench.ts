import { bench, describe } from 'vite-plus/test'
import { emitJumbleTiming, type JumbleTimingEvent } from '../../src/jumble/timing.ts'

const events = [
  {
    type: 'selection',
    kind: 'track',
    outcome: 'success',
    durationMs: 2_942.2,
    candidateFetchMs: 462.8,
    recentLookupMs: 3.1,
    hydrationMs: 2_443.3,
    candidateCount: 100,
    playableCandidateCount: 92,
    attempts: 1,
    deferredEnrichment: true
  },
  {
    type: 'start',
    kind: 'track',
    outcome: 'success',
    durationMs: 2_970.1,
    setupMs: 1.2,
    selectionMs: 2_942.2,
    hintsMs: 0.3,
    persistenceMs: 4.7,
    hintCount: 7,
    imageCount: 1
  }
] satisfies readonly JumbleTimingEvent[]

let serializedBytes = 0
const sink = (event: JumbleTimingEvent): void => {
  serializedBytes += `jumble timing ${JSON.stringify(event)}`.length
}

describe('Jumble timing serialization', () => {
  bench('emits and serializes the two start-path timing events', () => {
    for (const event of events) emitJumbleTiming(sink, event)
    if (serializedBytes < 0) throw new Error('unreachable')
  })
})
