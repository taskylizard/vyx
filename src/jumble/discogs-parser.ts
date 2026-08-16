import { unique } from 'radashi'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { normalizeAnswer, removeEditionSuffix } from './answer.ts'
import { createAnswerVariants, mergeImageUrlLists } from './candidate.ts'
import {
  DiscogsEnvelopeSchema,
  type DiscogsEnrichment,
  type DiscogsEnvelope,
  type DiscogsSearchResult
} from './discogs-types.ts'
import type { JumbleAlbumCandidate, JumbleTrackCandidate } from './types.ts'

const UnknownArraySchema = z.array(z.unknown()).catch([])
const DiscogsEnvelopeArraySchema = z.array(DiscogsEnvelopeSchema).catch([])
const OptionalDiscogsTextSchema = z.unknown().transform((value): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 512)
})
const DiscogsNumberSchema = z.unknown().transform((value): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return 0

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
})

export function parseDiscogsSearch(payload: unknown): DiscogsSearchResult[] {
  const root = DiscogsEnvelopeSchema.safeParse(payload)
  if (!root.success) return []

  return UnknownArraySchema.parse(root.data.results)
    .slice(0, 20)
    .flatMap((value) => {
      const entry = DiscogsEnvelopeSchema.safeParse(value)
      if (!entry.success) return []
      const id = DiscogsNumberSchema.parse(entry.data.id)
      const type = parseResultType(entry.data.type)
      if (id <= 0 || type === undefined) return []
      return [
        {
          id,
          type,
          title: OptionalDiscogsTextSchema.parse(entry.data.title),
          year: OptionalDiscogsTextSchema.parse(entry.data.year),
          resourceUrl: OptionalDiscogsTextSchema.parse(entry.data.resource_url),
          coverImage:
            OptionalDiscogsTextSchema.parse(entry.data.cover_image) ??
            OptionalDiscogsTextSchema.parse(entry.data.thumb),
          masterId: DiscogsNumberSchema.parse(entry.data.master_id) || undefined
        }
      ]
    })
}

export function parseDiscogsRelease(
  payload: DiscogsEnvelope | null,
  candidate: JumbleAlbumCandidate | JumbleTrackCandidate
): DiscogsEnrichment | undefined {
  if (payload === null) return undefined
  const id = DiscogsNumberSchema.parse(payload.id)
  const title = OptionalDiscogsTextSchema.parse(payload.title)
  const releaseTitle = title === undefined ? undefined : titleWithoutArtist(title)
  const titleVariants = releaseTitle === undefined ? [] : discogsTitleVariants(releaseTitle)
  const trackTitle = chooseDiscogsTrackTitle(payload.tracklist, candidate.answer)
  const candidateAnswer = normalizeAnswer(candidate.answer)
  const candidateAlbum = normalizeAnswer(candidate.albumName ?? '')
  const releaseAnswer = normalizeAnswer(releaseTitle ?? '')
  const rawAnswer = candidate.answer.trim().toLocaleLowerCase()
  const rawAlbum = candidate.albumName?.trim().toLocaleLowerCase() ?? ''
  const decorativeAnswerBelongsToAlbum = rawAnswer.length > 0 && rawAlbum.includes(rawAnswer)
  const aliases = match(candidate.kind)
    .with('album', () => titleVariants)
    .with('track', () => {
      if (trackTitle !== undefined) return discogsTitleVariants(trackTitle)
      if (
        candidateAnswer.length === 0 &&
        candidateAlbum.length > 0 &&
        releaseAnswer === candidateAlbum &&
        decorativeAnswerBelongsToAlbum
      ) {
        return titleVariants
      }
      return []
    })
    .exhaustive()
  const images = parseDiscogsImages(payload)
  const tags = parseDiscogsTags(payload)
  const label = parseDiscogsLabel(payload.labels)
  const releaseDate =
    OptionalDiscogsTextSchema.parse(payload.released) ??
    OptionalDiscogsTextSchema.parse(payload.year)
  const releaseType = parseDiscogsReleaseType(payload.formats)
  const summary = OptionalDiscogsTextSchema.parse(payload.notes)
  if (
    aliases.length === 0 &&
    images.length === 0 &&
    label === undefined &&
    releaseDate === undefined &&
    releaseType === undefined &&
    summary === undefined
  )
    return undefined
  return {
    answerVariants: aliases.length === 0 ? undefined : createAnswerVariants(aliases, 'discogs'),
    imageUrls: images.length === 0 ? undefined : images,
    releaseDate,
    releaseType,
    label,
    tags,
    summary,
    sourceUrl: id <= 0 ? undefined : `https://www.discogs.com/release/${Math.trunc(id)}`
  }
}

export function parseDiscogsArtist(payload: DiscogsEnvelope | null): DiscogsEnrichment | undefined {
  if (payload === null) return undefined
  const nameVariations = UnknownArraySchema.parse(payload.namevariations)
    .map((value) => OptionalDiscogsTextSchema.parse(value))
    .filter((value): value is string => value !== undefined)
  const images = parseDiscogsImages(payload)
  const id = DiscogsNumberSchema.parse(payload.id)
  const summary = OptionalDiscogsTextSchema.parse(payload.profile)
  if (nameVariations.length === 0 && images.length === 0 && summary === undefined) return undefined
  return {
    answerVariants:
      nameVariations.length === 0 ? undefined : createAnswerVariants(nameVariations, 'discogs'),
    imageUrls: images.length === 0 ? undefined : images,
    summary,
    sourceUrl: id <= 0 ? undefined : `https://www.discogs.com/artist/${Math.trunc(id)}`
  }
}

export function chooseDiscogsTrackTitle(
  value: unknown,
  candidateAnswer: string
): string | undefined {
  const titles = DiscogsEnvelopeArraySchema.parse(value)
    .map((entry) => OptionalDiscogsTextSchema.parse(entry.title))
    .filter((title): title is string => title !== undefined)
    .slice(0, 128)
  const expected = normalizeAnswer(removeEditionSuffix(candidateAnswer))
  if (expected.length > 0) {
    return titles.find((title) => {
      const normalized = normalizeAnswer(removeEditionSuffix(title))
      return normalized === expected
    })
  }
  const raw = candidateAnswer.trim().toLocaleLowerCase()
  return titles.find((title) => title.trim().toLocaleLowerCase() === raw)
}

export function discogsTitleVariants(value: string): string[] {
  const trimmed = value.trim()
  const withoutEdition = removeEditionSuffix(trimmed)
  const decorative = withoutEdition
    .replace(/^[^\p{Letter}\p{Number}]+/u, '')
    .replace(/[^\p{Letter}\p{Number}]+$/u, '')
    .trim()
  return unique([trimmed, withoutEdition, decorative].filter((entry) => entry.length > 0)).slice(
    0,
    8
  )
}

function titleWithoutArtist(value: string): string {
  const separator = value.indexOf(' - ')
  return separator < 0 ? value : value.slice(separator + 3).trim()
}

function parseDiscogsImages(payload: DiscogsEnvelope): string[] {
  const imageValues = DiscogsEnvelopeArraySchema.parse(payload.images).flatMap((entry) =>
    [
      OptionalDiscogsTextSchema.parse(entry.uri),
      OptionalDiscogsTextSchema.parse(entry.uri150)
    ].filter((value): value is string => value !== undefined)
  )
  return mergeImageUrlLists(
    imageValues,
    [
      OptionalDiscogsTextSchema.parse(payload.cover_image),
      OptionalDiscogsTextSchema.parse(payload.thumb)
    ].filter((value): value is string => value !== undefined)
  )
}

function parseDiscogsTags(payload: DiscogsEnvelope): string[] | undefined {
  const tags = [
    ...UnknownArraySchema.parse(payload.genres),
    ...UnknownArraySchema.parse(payload.styles),
    ...UnknownArraySchema.parse(payload.genre),
    ...UnknownArraySchema.parse(payload.style)
  ]
  const names = tags
    .map((value) => OptionalDiscogsTextSchema.parse(value))
    .filter((tag): tag is string => tag !== undefined)
  return names.length === 0 ? undefined : unique(names).slice(0, 8)
}

function parseDiscogsLabel(value: unknown): string | undefined {
  const first = DiscogsEnvelopeArraySchema.parse(value).at(0)
  return first === undefined ? undefined : OptionalDiscogsTextSchema.parse(first.name)
}

function parseDiscogsReleaseType(value: unknown): string | undefined {
  const first = DiscogsEnvelopeArraySchema.parse(value).at(0)
  if (first === undefined) return undefined
  const name = OptionalDiscogsTextSchema.parse(first.name)
  const descriptions = UnknownArraySchema.parse(first.descriptions)
    .map((entry) => OptionalDiscogsTextSchema.parse(entry))
    .filter((description): description is string => description !== undefined)
  if (name === undefined) return descriptions[0]
  return descriptions.length === 0 ? name : `${name} (${descriptions.slice(0, 2).join(', ')})`
}

function parseResultType(value: unknown): DiscogsSearchResult['type'] | undefined {
  return match(value)
    .returnType<DiscogsSearchResult['type'] | undefined>()
    .with('release', () => 'release')
    .with('master', () => 'master')
    .with('artist', () => 'artist')
    .otherwise(() => undefined)
}
