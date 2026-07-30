import { z } from 'zod'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import { JumbleAnswerVariantSchema } from './schemas.ts'

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

export const DiscogsEnvelopeSchema = z.record(z.string(), z.unknown())
export type DiscogsEnvelope = z.infer<typeof DiscogsEnvelopeSchema>

export const DiscogsEnrichmentSchema = z.object({
  answerVariants: z.array(JumbleAnswerVariantSchema).max(16).optional(),
  imageUrls: z.array(z.string()).max(8).optional(),
  releaseDate: z.string().optional(),
  releaseType: z.string().optional(),
  label: z.string().optional(),
  tags: z.array(z.string()).max(8).optional(),
  summary: z.string().optional(),
  sourceUrl: z.string().optional()
})

export type DiscogsEnrichment = z.infer<typeof DiscogsEnrichmentSchema>

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

export const DiscogsCachedValueSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), value: DiscogsEnrichmentSchema })
])

export type DiscogsCachedValue = z.infer<typeof DiscogsCachedValueSchema>
