import { z } from 'zod'
import type { JumbleMetadataCache } from './metadata-cache.ts'

export interface DeezerClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  maxPending?: number
  maxResponseBytes?: number
  cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  onError?: (error: unknown) => void
}

export const DeezerEnrichmentSchema = z.object({
  imageUrls: z.array(z.string()).max(8).optional(),
  releaseDate: z.string().optional(),
  releaseType: z.string().optional(),
  durationMs: z.number().optional(),
  albumName: z.string().optional(),
  sourceUrl: z.string().optional()
})

export type DeezerEnrichment = z.infer<typeof DeezerEnrichmentSchema>

export type DeezerParseResult =
  | { status: 'found'; value: DeezerEnrichment }
  | { status: 'not-found' }
  | { status: 'invalid' }

export type DeezerRequestResult = { status: 'ok'; payload: unknown } | { status: 'unavailable' }

export const DeezerCachedValueSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), value: DeezerEnrichmentSchema })
])

export type DeezerCachedValue = z.infer<typeof DeezerCachedValueSchema>
