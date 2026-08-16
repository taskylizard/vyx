import { match } from 'ts-pattern'
import { z } from 'zod'
import { normalizeAnswer } from './answer.ts'
import { mergeImageUrlLists } from './candidate.ts'
import type { DeezerParseResult } from './deezer-types.ts'
import type { JumbleCandidate } from './types.ts'

const text = z.string().trim().min(1).max(512)
const url = z.string().trim().min(1).max(2_048)
const identifier = z.number().int().positive()
const artist = z.object({ id: identifier, name: text })

const artistSearch = z.object({
  data: z
    .array(
      z.object({
        id: identifier,
        name: text,
        link: url.nullish(),
        picture: url.nullish(),
        picture_medium: url.nullish(),
        picture_big: url.nullish(),
        picture_xl: url.nullish()
      })
    )
    .max(25)
})

const albumSearch = z.object({
  data: z
    .array(
      z.object({
        id: identifier,
        title: text,
        link: url.nullish(),
        cover: url.nullish(),
        cover_medium: url.nullish(),
        cover_big: url.nullish(),
        cover_xl: url.nullish(),
        release_date: text.nullish(),
        record_type: text.nullish(),
        artist
      })
    )
    .max(25)
})

const trackSearch = z.object({
  data: z
    .array(
      z.object({
        id: identifier,
        title: text,
        title_short: text.nullish(),
        link: url.nullish(),
        duration: z.number().nonnegative().max(86_400).nullish(),
        artist,
        album: z.object({
          id: identifier,
          title: text,
          cover: url.nullish(),
          cover_medium: url.nullish(),
          cover_big: url.nullish(),
          cover_xl: url.nullish()
        })
      })
    )
    .max(25)
})

export function parseDeezerSearch(payload: unknown, candidate: JumbleCandidate): DeezerParseResult {
  return match(candidate)
    .returnType<DeezerParseResult>()
    .with({ kind: 'artist' }, (expected) => {
      const parsed = artistSearch.safeParse(payload)
      if (!parsed.success) return { status: 'invalid' }
      const result = parsed.data.data.find((entry) => exactName(entry.name, expected.answer))
      if (result === undefined) return { status: 'not-found' }

      return {
        status: 'found',
        value: {
          imageUrls: deezerImageUrls([
            result.picture_xl,
            result.picture_big,
            result.picture_medium,
            result.picture
          ]),
          sourceUrl: result.link ?? `https://www.deezer.com/artist/${result.id}`
        }
      }
    })
    .with({ kind: 'album' }, (expected) => {
      const parsed = albumSearch.safeParse(payload)
      if (!parsed.success) return { status: 'invalid' }
      const result = parsed.data.data
        .filter(
          (entry) =>
            exactName(entry.title, expected.answer) &&
            (expected.artistName === undefined || exactName(entry.artist.name, expected.artistName))
        )
        .toSorted(
          (first, second) =>
            titleScore(second.title, expected.answer) - titleScore(first.title, expected.answer)
        )
        .at(0)
      if (result === undefined) return { status: 'not-found' }

      return {
        status: 'found',
        value: {
          imageUrls: deezerImageUrls([
            result.cover_xl,
            result.cover_big,
            result.cover_medium,
            result.cover
          ]),
          releaseDate: result.release_date ?? undefined,
          releaseType: result.record_type ?? undefined,
          sourceUrl: result.link ?? `https://www.deezer.com/album/${result.id}`
        }
      }
    })
    .with({ kind: 'track' }, (expected) => {
      const parsed = trackSearch.safeParse(payload)
      if (!parsed.success) return { status: 'invalid' }
      const result = parsed.data.data
        .filter(
          (entry) =>
            (exactName(entry.title, expected.answer) ||
              (entry.title_short !== null &&
                entry.title_short !== undefined &&
                exactName(entry.title_short, expected.answer))) &&
            (expected.artistName === undefined || exactName(entry.artist.name, expected.artistName))
        )
        .toSorted(
          (first, second) =>
            titleScore(second.title, expected.answer) - titleScore(first.title, expected.answer)
        )
        .at(0)
      if (result === undefined) return { status: 'not-found' }

      return {
        status: 'found',
        value: {
          imageUrls: deezerImageUrls([
            result.album.cover_xl,
            result.album.cover_big,
            result.album.cover_medium,
            result.album.cover
          ]),
          albumName: result.album.title,
          durationMs:
            result.duration === null || result.duration === undefined
              ? undefined
              : Math.trunc(result.duration * 1_000),
          sourceUrl: result.link ?? `https://www.deezer.com/track/${result.id}`
        }
      }
    })
    .exhaustive()
}

function exactName(actual: string, expected: string): boolean {
  const actualNormalized = normalizeAnswer(actual)
  const expectedNormalized = normalizeAnswer(expected)
  if (actualNormalized.length > 0 && expectedNormalized.length > 0) {
    return actualNormalized === expectedNormalized
  }
  return actual.trim().localeCompare(expected.trim(), undefined, { sensitivity: 'base' }) === 0
}

function titleScore(actual: string, expected: string): number {
  if (actual.trim().localeCompare(expected.trim(), undefined, { sensitivity: 'base' }) === 0)
    return 2
  return Number(!(/\blive\b/iu.test(actual) && !/\blive\b/iu.test(expected)))
}

function deezerImageUrls(values: readonly (string | null | undefined)[]): string[] | undefined {
  const images = mergeImageUrlLists(
    values.filter(
      (value): value is string =>
        value !== null && value !== undefined && !/\/images\/(?:artist|cover)\/\//u.test(value)
    )
  )
  return images.length === 0 ? undefined : images
}
