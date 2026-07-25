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

export interface JumbleCandidate {
  kind: JumbleKind
  answer: string
  artistName?: string
  albumName?: string
  imageUrl?: string
  playcount?: number
  listeners?: number
  mbid?: string
  releaseDate?: string
  releaseType?: string
  label?: string
  durationMs?: number
  disambiguation?: string
  entityType?: string
  countryCode?: string
  startDate?: string
  endDate?: string
  artistMetadata?: JumbleArtistMetadata
  tags?: readonly string[]
  summary?: string
  sourceUrl?: string
}

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

export function isJumbleKind(value: string): value is JumbleKind {
  return (JUMBLE_KINDS as readonly string[]).includes(value)
}
