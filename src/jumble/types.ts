export const JUMBLE_KINDS = ['artist', 'album', 'track'] as const
export type JumbleKind = (typeof JUMBLE_KINDS)[number]

export type JumbleOutcome = 'won' | 'gave_up' | 'expired'

export interface JumbleHint {
  kind: string
  content: string
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
}

interface JumbleCandidateBase {
  answer: string
  imageUrl?: string
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

interface JumbleReleaseCandidateBase extends JumbleCandidateBase {
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

export interface JumbleSessionMetadata {
  candidate: JumbleCandidate
  shuffledAnswer?: string
  hints: readonly JumbleHint[]
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

export interface JumbleState {
  session: JumbleSession
  hints: readonly (JumbleHint & { shown: boolean; order: number })[]
}

export type JumbleAction =
  | 'started'
  | 'updated'
  | 'incorrect'
  | 'won'
  | 'gave_up'
  | 'expired'
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
}

export interface JumbleServiceOptions {
  now?: () => number
  randomIndex?: (maxExclusive: number) => number
  onExpired?: (state: JumbleState) => void | Promise<void>
}

export function isJumbleKind(value: string): value is JumbleKind {
  return JUMBLE_KINDS.some((kind) => kind === value)
}
