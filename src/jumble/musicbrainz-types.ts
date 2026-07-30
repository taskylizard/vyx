import { z } from 'zod'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import { JumbleAnswerVariantSchema } from './schemas.ts'

export interface MusicBrainzClientOptions {
  cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  fetchImpl?: typeof fetch
  baseUrl?: string
  userAgent?: string
  timeoutMs?: number
  minIntervalMs?: number
  maxQueueWaitMs?: number
  maxPending?: number
  maxResponseBytes?: number
  now?: () => number
  onError?: (error: unknown) => void
}

export const MusicBrainzEnvelopeSchema = z.record(z.string(), z.unknown())
export type MusicBrainzEnvelope = z.infer<typeof MusicBrainzEnvelopeSchema>

export const ReleaseMetadataSchema = z.object({
  releaseDate: z.string().optional(),
  releaseType: z.string().optional(),
  label: z.string().optional(),
  disambiguation: z.string().optional(),
  mbid: z.string().optional(),
  releaseGroupMbid: z.string().optional(),
  answerVariants: z.array(JumbleAnswerVariantSchema).max(16).optional(),
  imageUrls: z.array(z.string()).max(8).optional()
})

export type ReleaseMetadata = z.infer<typeof ReleaseMetadataSchema>

export const RecordingMetadataSchema = ReleaseMetadataSchema.extend({
  durationMs: z.number().optional(),
  albumName: z.string().optional(),
  releaseMbid: z.string().optional()
})

export type RecordingMetadata = z.infer<typeof RecordingMetadataSchema>

export type CachedMusicBrainzValue<T> = { found: false } | { found: true; value: T }

export type CachedMusicBrainzLookup<T> =
  | { found: false; fresh: boolean }
  | { found: true; fresh: boolean; value: T }

export function musicBrainzCachedValueSchema<T>(
  valueSchema: z.ZodType<T>
): z.ZodType<CachedMusicBrainzValue<T>> {
  return z.discriminatedUnion('found', [
    z.object({ found: z.literal(false) }),
    z.object({ found: z.literal(true), value: valueSchema })
  ])
}
