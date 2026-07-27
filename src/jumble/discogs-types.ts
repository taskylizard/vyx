import { z } from 'zod'
import type { JumbleAnswerVariant } from './types.ts'
import type { JumbleMetadataCache } from './metadata-cache.ts'

export interface DiscogsClientOptions {
  token?: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  userAgent?: string
  timeoutMs?: number
  minIntervalMs?: number
  maxPending?: number
  maxResponseBytes?: number
  cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  now?: () => number
  onError?: (error: unknown) => void
}

export interface DiscogsEnvelope {
  [key: string]: unknown
}

export interface DiscogsEnrichment {
  answerVariants?: readonly JumbleAnswerVariant[]
  imageUrls?: readonly string[]
  releaseDate?: string
  releaseType?: string
  label?: string
  tags?: readonly string[]
  summary?: string
  sourceUrl?: string
}

export interface DiscogsSearchResult {
  id: number
  type: 'release' | 'master' | 'artist'
  title?: string
  year?: string
  resourceUrl?: string
  coverImage?: string
  masterId?: number
}

export type DiscogsReleaseSearchResult = Omit<DiscogsSearchResult, 'type'> & {
  type: 'release' | 'master'
}

export type DiscogsReleaseLookup =
  | { status: 'found'; result: DiscogsReleaseSearchResult }
  | { status: 'not-found' }
  | { status: 'unavailable' }

const answerVariantSchema = z.object({
  value: z.string(),
  source: z.enum(['lastfm', 'musicbrainz', 'discogs', 'transliteration', 'manual']),
  locale: z.string().optional()
})

export const DiscogsEnrichmentSchema: z.ZodType<DiscogsEnrichment> = z.object({
  answerVariants: z.array(answerVariantSchema).max(16).optional(),
  imageUrls: z.array(z.string()).max(8).optional(),
  releaseDate: z.string().optional(),
  releaseType: z.string().optional(),
  label: z.string().optional(),
  tags: z.array(z.string()).max(8).optional(),
  summary: z.string().optional(),
  sourceUrl: z.string().optional()
})

export type DiscogsCachedValue = { found: false } | { found: true; value: DiscogsEnrichment }

export const DiscogsCachedValueSchema: z.ZodType<DiscogsCachedValue> = z.discriminatedUnion(
  'found',
  [
    z.object({ found: z.literal(false) }),
    z.object({ found: z.literal(true), value: DiscogsEnrichmentSchema })
  ]
)
