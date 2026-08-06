import type { JumbleKind } from './types.ts'

export type JumbleTimingEvent =
  | {
      type: 'library'
      kind: JumbleKind
      source: 'hit' | 'stale' | 'refreshed' | 'fallback'
      outcome: 'success' | 'failed'
      durationMs: number
      candidateCount: number
    }
  | {
      type: 'provider'
      provider: 'lastfm'
      operation: 'details'
      kind: JumbleKind
      outcome: 'success' | 'partial' | 'failed'
      durationMs: number
      imageCount: number
    }
  | {
      type: 'provider'
      provider: 'musicbrainz' | 'discogs' | 'deezer'
      operation: 'enrichment'
      phase: 'foreground' | 'background'
      kind: JumbleKind
      outcome: 'success' | 'unchanged' | 'failed'
      durationMs: number
      imageCount: number
    }
  | {
      type: 'selection'
      kind: JumbleKind
      outcome: 'success' | 'failed'
      durationMs: number
      candidateFetchMs: number
      recentLookupMs: number
      hydrationMs: number
      candidateCount: number
      playableCandidateCount: number
      attempts: number
      deferredEnrichment: boolean
    }
  | {
      type: 'start'
      kind: JumbleKind
      outcome: 'success' | 'failed'
      durationMs: number
      setupMs: number
      selectionMs: number
      hintsMs: number
      persistenceMs: number
      hintCount: number
      imageCount: number
    }
  | {
      type: 'render'
      mode: 'pixelated'
      outcome: 'success' | 'failed'
      durationMs: number
      sourceCount: number
      stage: number
    }
  | {
      type: 'render'
      mode: 'revealed'
      outcome: 'success' | 'failed'
      durationMs: number
      sourceCount: number
    }

export type JumbleTimingSink = (event: JumbleTimingEvent) => void

export function jumbleDurationMs(startedAt: number): number {
  const duration = performance.now() - startedAt
  if (!Number.isFinite(duration) || duration < 0) return 0
  return Math.round(duration * 10) / 10
}

export function emitJumbleTiming(
  sink: JumbleTimingSink | undefined,
  event: JumbleTimingEvent
): void {
  if (sink === undefined) return
  try {
    sink(event)
  } catch {}
}
