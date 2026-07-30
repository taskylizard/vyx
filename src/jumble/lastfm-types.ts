import { z } from 'zod'
import type { MusicBrainzClient } from './musicbrainz.ts'
import type { DiscogsClient } from './discogs.ts'
import type { DeezerClient } from './deezer.ts'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import type { JumbleCandidate, JumbleHint, JumbleKind } from './types.ts'
import type { JumbleTimingSink } from './timing.ts'

export interface LastFmClientOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  cacheEntries?: number
  cacheBytes?: number
  maxResponseBytes?: number
  cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  musicBrainz?: Pick<MusicBrainzClient, 'enrich'>
  discogs?: Pick<DiscogsClient, 'enrich'>
  deezer?: Pick<DeezerClient, 'enrich'>
  onTiming?: JumbleTimingSink
  onError?: (error: unknown) => void
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

export const LastFmEnvelopeSchema = z
  .object({
    error: z.number().optional(),
    message: z.string().optional()
  })
  .catchall(z.unknown())

export type LastFmEnvelope = z.infer<typeof LastFmEnvelopeSchema>
