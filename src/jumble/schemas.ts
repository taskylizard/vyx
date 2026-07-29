import { z } from 'zod'
import {
  JUMBLE_KINDS,
  type JumbleArtistMetadata,
  type JumbleAnswerVariant,
  type JumbleCandidate,
  type JumbleSessionMetadata
} from './types.ts'

export const JumbleArtistMetadataSchema: z.ZodType<JumbleArtistMetadata> = z
  .object({
    mbid: z.string().optional(),
    type: z.string().optional(),
    countryCode: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    disambiguation: z.string().optional(),
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
    aliases: z.array(z.string()).max(8).optional()
  })
  .passthrough()

const JumbleAnswerVariantSchema: z.ZodType<JumbleAnswerVariant> = z.object({
  value: z.string(),
  source: z.enum(['lastfm', 'musicbrainz', 'discogs', 'transliteration', 'manual']),
  locale: z.string().optional()
})

const JumbleCandidateBaseSchema = z.object({
  answer: z.string(),
  imageUrl: z.string().optional(),
  imageUrls: z.array(z.string()).max(8).optional(),
  answerVariants: z.array(JumbleAnswerVariantSchema).max(16).optional(),
  playcount: z.number().optional(),
  listeners: z.number().optional(),
  mbid: z.string().optional(),
  disambiguation: z.string().optional(),
  artistMetadata: JumbleArtistMetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
  sourceUrl: z.string().optional()
})

const JumbleReleaseCandidateBaseSchema = JumbleCandidateBaseSchema.extend({
  artistName: z.string().optional(),
  albumName: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseType: z.string().optional(),
  label: z.string().optional(),
  durationMs: z.number().optional()
})

export const JumbleCandidateSchema: z.ZodType<JumbleCandidate> = z.discriminatedUnion('kind', [
  JumbleCandidateBaseSchema.extend({
    kind: z.literal(JUMBLE_KINDS[0]),
    entityType: z.string().optional(),
    countryCode: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }),
  JumbleReleaseCandidateBaseSchema.extend({
    kind: z.literal(JUMBLE_KINDS[1])
  }),
  JumbleReleaseCandidateBaseSchema.extend({
    kind: z.literal(JUMBLE_KINDS[2])
  })
])

export const JumbleSessionMetadataSchema: z.ZodType<JumbleSessionMetadata> = z
  .object({
    candidate: JumbleCandidateSchema,
    shuffledAnswer: z.string().optional(),
    answerVariants: z.array(JumbleAnswerVariantSchema).max(16).optional(),
    continuousSession: z
      .object({
        id: z.string().uuid()
      })
      .optional(),
    hints: z.array(
      z.object({
        kind: z.string(),
        content: z.string()
      })
    )
  })
  .passthrough()
