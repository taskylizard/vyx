import type { JumbleLibrary } from './library.ts'
import type { JumbleTimingSink } from './timing.ts'

export const JUMBLE_KINDS = ['artist', 'album', 'track'] as const
export type JumbleKind = (typeof JUMBLE_KINDS)[number]

export const JUMBLE_OUTCOMES = ['won', 'gave_up', 'expired', 'cancelled'] as const
export type JumbleOutcome = (typeof JUMBLE_OUTCOMES)[number]

export const JUMBLE_ERROR_CODES = [
  'busy',
  'profile-missing',
  'no-candidates',
  'invalid-candidate',
  'not-found',
  'not-supported',
  'forbidden',
  'configuration'
] as const
export type JumbleErrorCode = (typeof JUMBLE_ERROR_CODES)[number]

/** Provenance for an answer accepted in addition to the displayed title. */
export const JUMBLE_ANSWER_SOURCES = [
  'lastfm',
  'musicbrainz',
  'discogs',
  'transliteration',
  'manual'
] as const
export type JumbleAnswerSource = (typeof JUMBLE_ANSWER_SOURCES)[number]

export interface JumbleAnswerVariant {
  value: string
  source: JumbleAnswerSource
  locale?: string
}

export interface JumbleHint {
  kind: string
  content: string
}

export interface JumbleContinuousSession {
  id: string
}

export interface JumbleArtistMetadata {
  mbid?: string
  type?: string
  countryCode?: string
  startDate?: string
  endDate?: string
  disambiguation?: string
  tags?: readonly string[]
  summary?: string
  aliases?: readonly string[]
}

export interface JumbleCandidateBase {
  answer: string
  imageUrl?: string
  imageUrls?: readonly string[]
  answerVariants?: readonly JumbleAnswerVariant[]
  playcount?: number
  listeners?: number
  mbid?: string
  disambiguation?: string
  artistMetadata?: JumbleArtistMetadata
  tags?: readonly string[]
  summary?: string
  sourceUrl?: string
}

export interface JumbleArtistCandidate extends JumbleCandidateBase {
  kind: 'artist'
  artistName?: never
  albumName?: never
  releaseDate?: never
  releaseType?: never
  label?: never
  durationMs?: never
  entityType?: string
  countryCode?: string
  startDate?: string
  endDate?: string
}

export interface JumbleReleaseCandidateBase extends JumbleCandidateBase {
  artistName?: string
  albumName?: string
  releaseDate?: string
  releaseType?: string
  label?: string
  durationMs?: number
  entityType?: never
  countryCode?: never
  startDate?: never
  endDate?: never
}

export interface JumbleAlbumCandidate extends JumbleReleaseCandidateBase {
  kind: 'album'
}

export interface JumbleTrackCandidate extends JumbleReleaseCandidateBase {
  kind: 'track'
}

export type JumbleCandidate = JumbleArtistCandidate | JumbleAlbumCandidate | JumbleTrackCandidate

export type JumbleStartHydration =
  | { status: 'complete'; candidate: JumbleCandidate }
  | {
      status: 'deferred'
      candidate: JumbleCandidate
      completion: Promise<JumbleCandidate>
    }

export interface JumbleSessionMetadata {
  candidate: JumbleCandidate
  shuffledAnswer?: string
  answerVariants?: readonly JumbleAnswerVariant[]
  hints: readonly JumbleHint[]
  continuousSession?: JumbleContinuousSession
}

export interface JumbleSession {
  id: string
  starterUserId: string
  guildId: string | null
  channelId: string
  messageId: string | null
  kind: JumbleKind
  sourceUsername: string
  answer: string
  artistName: string | null
  albumName: string | null
  imageUrl: string | null
  metadata: JumbleSessionMetadata
  startedAt: number
  endedAt: number | null
  outcome: JumbleOutcome | null
  blurStage: number
  reshuffleCount: number
}

export interface JumbleStats {
  played: number
  won: number
  gaveUp: number
  expired: number
  guesses: number
  correctGuesses: number
  averageSeconds: number | null
  averageHints: number | null
  averageReshuffles: number | null
}

export interface JumbleStatsByKind {
  all: JumbleStats
  artist: JumbleStats
  album: JumbleStats
  track: JumbleStats
}

export interface JumbleTrackedCounts {
  all: number
  artist: number
  album: number
  track: number
}

export interface JumbleProfileSummary {
  username: string | null
  stats: JumbleStatsByKind
  tracked: JumbleTrackedCounts
}

export interface JumbleState {
  session: JumbleSession
  hints: readonly (JumbleHint & { shown: boolean; order: number })[]
}

export type JumbleActivityState =
  | { status: 'active'; state: JumbleState }
  | { status: 'ended'; action: JumbleOutcome | 'unchanged'; state: JumbleState }

export type JumbleAction =
  | 'started'
  | 'updated'
  | 'incorrect'
  | 'won'
  | 'gave_up'
  | 'expired'
  | 'cancelled'
  | 'unchanged'

export type JumbleActionResult<TAction extends JumbleAction = JumbleAction> = {
  [Action in TAction]: { action: Action; state: JumbleState }
}[TAction]

export interface StartJumbleInput {
  starterUserId: string
  guildId: string | null
  channelId: string
  kind: JumbleKind
  username?: string
  continuousSession?: JumbleContinuousSession
}

export interface JumbleServiceOptions {
  now?: () => number
  randomIndex?: (maxExclusive: number) => number
  onExpired?: (state: JumbleState) => void | Promise<void>
  onTiming?: JumbleTimingSink
  library?: JumbleLibrary
}

export function isJumbleKind(value: string): value is JumbleKind {
  return JUMBLE_KINDS.some((kind) => kind === value)
}
