import { match } from 'ts-pattern'
import { normalizeAnswer, removeEditionSuffix } from './answer.ts'
import { createAnswerVariants, mergeImageUrlLists } from './candidate.ts'
import type { DiscogsEnrichment, DiscogsEnvelope, DiscogsSearchResult } from './discogs-types.ts'
import type { JumbleAlbumCandidate, JumbleTrackCandidate } from './types.ts'

export function parseDiscogsSearch(payload: unknown): DiscogsSearchResult[] {
  if (!isDiscogsObject(payload) || !Array.isArray(payload.results)) return []
  return payload.results.slice(0, 20).flatMap((value) => {
    if (!isDiscogsObject(value)) return []
    const id = numberValue(value.id)
    const type = parseResultType(value.type)
    if (id <= 0 || type === undefined) return []
    return [
      {
        id,
        type,
        title: stringValue(value.title),
        year: stringValue(value.year),
        resourceUrl: stringValue(value.resource_url),
        coverImage: stringValue(value.cover_image) ?? stringValue(value.thumb),
        masterId: numberValue(value.master_id) || undefined
      }
    ]
  })
}

export function parseDiscogsRelease(
  payload: DiscogsEnvelope | null,
  candidate: JumbleAlbumCandidate | JumbleTrackCandidate
): DiscogsEnrichment | undefined {
  if (payload === null) return undefined
  const id = numberValue(payload.id)
  const title = stringValue(payload.title)
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
  const releaseDate = stringValue(payload.released) ?? stringValue(payload.year)
  const releaseType = parseDiscogsReleaseType(payload.formats)
  const summary = stringValue(payload.notes)
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
  const nameVariations = arrayValue(payload.namevariations)
    .map(stringValue)
    .filter((value): value is string => value !== undefined)
  const images = parseDiscogsImages(payload)
  const id = numberValue(payload.id)
  const summary = stringValue(payload.profile)
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
  const titles = arrayValue(value)
    .filter(isDiscogsObject)
    .map((entry) => stringValue(entry.title))
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
  return [
    ...new Set([trimmed, withoutEdition, decorative].filter((entry) => entry.length > 0))
  ].slice(0, 8)
}

function titleWithoutArtist(value: string): string {
  const separator = value.indexOf(' - ')
  return separator < 0 ? value : value.slice(separator + 3).trim()
}

function parseDiscogsImages(payload: DiscogsEnvelope): string[] {
  const imageValues = arrayValue(payload.images).flatMap((entry) => {
    if (!isDiscogsObject(entry)) return []
    return [stringValue(entry.uri), stringValue(entry.uri150)].filter(
      (value): value is string => value !== undefined
    )
  })
  return mergeImageUrlLists(
    imageValues,
    [stringValue(payload.cover_image), stringValue(payload.thumb)].filter(
      (value): value is string => value !== undefined
    )
  )
}

function parseDiscogsTags(payload: DiscogsEnvelope): string[] | undefined {
  const tags = [
    ...arrayValue(payload.genres),
    ...arrayValue(payload.styles),
    ...arrayValue(payload.genre),
    ...arrayValue(payload.style)
  ]
  const names = tags.map(stringValue).filter((tag): tag is string => tag !== undefined)
  return names.length === 0 ? undefined : [...new Set(names)].slice(0, 8)
}

function parseDiscogsLabel(value: unknown): string | undefined {
  const first = arrayValue(value).find(isDiscogsObject)
  return first === undefined ? undefined : stringValue(first.name)
}

function parseDiscogsReleaseType(value: unknown): string | undefined {
  const first = arrayValue(value).find(isDiscogsObject)
  if (first === undefined) return undefined
  const name = stringValue(first.name)
  const descriptions = arrayValue(first.descriptions)
    .map(stringValue)
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

function isDiscogsObject(value: unknown): value is DiscogsEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 512)
    : undefined
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
