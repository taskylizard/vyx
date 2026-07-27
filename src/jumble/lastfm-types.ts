import type { MusicBrainzClient } from './musicbrainz.ts'
import type { DiscogsClient } from './discogs.ts'
import type { JumbleCandidate, JumbleHint, JumbleKind } from './types.ts'

export interface LastFmClientOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  cacheEntries?: number
  cacheBytes?: number
  maxResponseBytes?: number
  musicBrainz?: Pick<MusicBrainzClient, 'enrich'>
  discogs?: Pick<DiscogsClient, 'enrich'>
}

export interface JumbleMusicProvider {
  getCandidates(
    kind: JumbleKind,
    username: string,
    limit?: number
  ): Promise<readonly JumbleCandidate[]>
  getHints(candidate: JumbleCandidate): Promise<readonly JumbleHint[]>
  validateUsername?(username: string): Promise<string>
}

export interface LastFmEnvelope {
  error?: number
  message?: string
  [key: string]: unknown
}

export interface LastFmImage {
  '#text'?: unknown
  size?: unknown
}
