import { match } from 'ts-pattern'
import { normalizeAnswer } from './answer.ts'
import type {
  JumbleAnswerSource,
  JumbleAnswerVariant,
  JumbleArtistCandidate,
  JumbleArtistMetadata,
  JumbleCandidate,
  JumbleCandidateBase,
  JumbleKind,
  JumbleReleaseCandidateBase
} from './types.ts'

export const MAX_JUMBLE_IMAGE_URLS = 8
export const MAX_JUMBLE_ANSWER_VARIANTS = 16

export function jumbleCandidateIdentityKey(candidate: {
  kind: JumbleKind
  answer: string
  artistName?: string | null
}): string {
  return match(candidate.kind)
    .with('artist', () => JSON.stringify(['artist', normalizeAnswer(candidate.answer)]))
    .with('album', 'track', (kind) =>
      JSON.stringify([
        kind,
        normalizeAnswer(candidate.answer),
        normalizeAnswer(candidate.artistName ?? '')
      ])
    )
    .exhaustive()
}

/** Return bounded, valid artwork URLs in preference order. */
export function getCandidateImageUrls(candidate: JumbleCandidate): string[] {
  return mergeImageUrlLists(
    candidate.imageUrl === undefined ? undefined : [candidate.imageUrl],
    candidate.imageUrls
  )
}

export function isJumbleCandidateIdentityValid(
  candidate: JumbleCandidate,
  kind: JumbleKind
): boolean {
  return (
    candidate.kind === kind && candidate.answer.trim().length >= 2 && candidate.answer.length <= 120
  )
}

export function isPlayableJumbleCandidate(candidate: JumbleCandidate, kind: JumbleKind): boolean {
  if (!isJumbleCandidateIdentityValid(candidate, kind)) return false
  const hasSemanticAnswer =
    normalizeAnswer(candidate.answer).length > 0 ||
    (candidate.answerVariants ?? []).some((variant) => normalizeAnswer(variant.value).length > 0)
  return hasSemanticAnswer && getCandidateImageUrls(candidate).length > 0
}

export function mergeImageUrlLists(...lists: readonly (readonly string[] | undefined)[]): string[] {
  const urls: string[] = []
  for (const list of lists) {
    for (const value of list ?? []) {
      const url = value.trim()
      if (!isHttpUrl(url) || urls.includes(url)) continue
      urls.push(url)
      if (urls.length >= MAX_JUMBLE_IMAGE_URLS) break
    }
    if (urls.length >= MAX_JUMBLE_IMAGE_URLS) break
  }
  return urls
}

/** Create bounded answer variants while preserving their source provenance. */
export function createAnswerVariants(
  values: readonly string[],
  source: JumbleAnswerSource,
  locale?: string
): JumbleAnswerVariant[] {
  const variants: JumbleAnswerVariant[] = []
  for (const value of values) {
    const trimmed = value.trim().slice(0, 512)
    if (trimmed.length === 0) continue
    const key = answerVariantKey(trimmed)
    if (variants.some((variant) => answerVariantKey(variant.value) === key)) continue
    variants.push({ value: trimmed, source, ...(locale === undefined ? {} : { locale }) })
    if (variants.length >= MAX_JUMBLE_ANSWER_VARIANTS) break
  }
  return variants
}

/** Merge provider variants without allowing unbounded metadata growth. */
export function mergeAnswerVariantLists(
  ...lists: readonly (readonly JumbleAnswerVariant[] | undefined)[]
): JumbleAnswerVariant[] | undefined {
  const variants: JumbleAnswerVariant[] = []
  for (const list of lists) {
    for (const variant of list ?? []) {
      const value = variant.value.trim().slice(0, 512)
      if (
        value.length === 0 ||
        variants.some((entry) => answerVariantKey(entry.value) === answerVariantKey(value))
      )
        continue
      variants.push({
        value,
        source: variant.source,
        ...(variant.locale === undefined ? {} : { locale: variant.locale })
      })
      if (variants.length >= MAX_JUMBLE_ANSWER_VARIANTS) return variants
    }
  }
  return variants.length === 0 ? undefined : variants
}

/** Merge two enrichment results while keeping the canonical answer stable. */
export function mergeJumbleCandidates(
  base: JumbleCandidate,
  ...updates: readonly (JumbleCandidate | undefined)[]
): JumbleCandidate {
  let merged = base
  for (const update of updates) {
    if (update === undefined) continue
    merged = match(merged)
      .returnType<JumbleCandidate>()
      .with({ kind: 'artist' }, (artist) =>
        match(update)
          .with({ kind: 'artist' }, (next) => mergeArtist(artist, next))
          .otherwise(() => artist)
      )
      .with({ kind: 'album' }, (album) =>
        match(update)
          .with({ kind: 'album' }, (next) => mergeRelease(album, next, 'album'))
          .otherwise(() => album)
      )
      .with({ kind: 'track' }, (track) =>
        match(update)
          .with({ kind: 'track' }, (next) => mergeRelease(track, next, 'track'))
          .otherwise(() => track)
      )
      .exhaustive()
  }
  return merged
}

function mergeArtist(
  first: JumbleArtistCandidate,
  second: JumbleArtistCandidate
): JumbleArtistCandidate {
  const common = mergeBase(first, second)
  return {
    ...common,
    kind: 'artist',
    entityType: first.entityType ?? second.entityType,
    countryCode: first.countryCode ?? second.countryCode,
    startDate: first.startDate ?? second.startDate,
    endDate: first.endDate ?? second.endDate
  }
}

function mergeRelease(
  first: JumbleReleaseCandidateBase,
  second: JumbleReleaseCandidateBase,
  kind: 'album' | 'track'
): JumbleCandidate {
  const common = mergeBase(first, second)
  return match(kind)
    .returnType<JumbleCandidate>()
    .with('album', () => ({
      ...common,
      kind: 'album',
      ...((first.artistName ?? second.artistName) === undefined
        ? {}
        : { artistName: first.artistName ?? second.artistName }),
      ...((first.albumName ?? second.albumName) === undefined
        ? {}
        : { albumName: first.albumName ?? second.albumName }),
      ...((first.releaseDate ?? second.releaseDate) === undefined
        ? {}
        : { releaseDate: first.releaseDate ?? second.releaseDate }),
      ...((first.releaseType ?? second.releaseType) === undefined
        ? {}
        : { releaseType: first.releaseType ?? second.releaseType }),
      ...((first.label ?? second.label) === undefined
        ? {}
        : { label: first.label ?? second.label }),
      ...((first.durationMs ?? second.durationMs) === undefined
        ? {}
        : { durationMs: first.durationMs ?? second.durationMs })
    }))
    .with('track', () => ({
      ...common,
      kind: 'track',
      ...((first.artistName ?? second.artistName) === undefined
        ? {}
        : { artistName: first.artistName ?? second.artistName }),
      ...((first.albumName ?? second.albumName) === undefined
        ? {}
        : { albumName: first.albumName ?? second.albumName }),
      ...((first.releaseDate ?? second.releaseDate) === undefined
        ? {}
        : { releaseDate: first.releaseDate ?? second.releaseDate }),
      ...((first.releaseType ?? second.releaseType) === undefined
        ? {}
        : { releaseType: first.releaseType ?? second.releaseType }),
      ...((first.label ?? second.label) === undefined
        ? {}
        : { label: first.label ?? second.label }),
      ...((first.durationMs ?? second.durationMs) === undefined
        ? {}
        : { durationMs: first.durationMs ?? second.durationMs })
    }))
    .exhaustive()
}

function mergeBase(first: JumbleCandidateBase, second: JumbleCandidateBase): JumbleCandidateBase {
  const imageUrls = mergeImageUrls(first, second)
  const answerVariants = mergeAnswerVariantLists(first.answerVariants, second.answerVariants)
  return {
    ...first,
    ...second,
    answer: first.answer,
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length === 0 ? undefined : imageUrls,
    answerVariants,
    playcount: first.playcount ?? second.playcount,
    listeners: first.listeners ?? second.listeners,
    mbid: first.mbid ?? second.mbid,
    disambiguation: first.disambiguation ?? second.disambiguation,
    artistMetadata: mergeArtistMetadata(first.artistMetadata, second.artistMetadata),
    tags: mergeTextValues(first.tags, second.tags),
    summary: first.summary ?? second.summary,
    sourceUrl: first.sourceUrl ?? second.sourceUrl
  }
}

function mergeArtistMetadata(
  first: JumbleArtistMetadata | undefined,
  second: JumbleArtistMetadata | undefined
): JumbleArtistMetadata | undefined {
  if (first === undefined) return second
  if (second === undefined) return first
  const aliases = mergeTextValues(first.aliases, second.aliases)
  return {
    ...second,
    ...first,
    tags: mergeTextValues(first.tags, second.tags),
    aliases,
    summary: first.summary ?? second.summary
  }
}

function mergeImageUrls(first: JumbleCandidateBase, second: JumbleCandidateBase): string[] {
  return mergeImageUrlLists(
    first.imageUrl === undefined ? undefined : [first.imageUrl],
    first.imageUrls,
    second.imageUrl === undefined ? undefined : [second.imageUrl],
    second.imageUrls
  )
}

function mergeTextValues(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])]
  const unique: string[] = []
  for (const value of values) {
    const trimmed = value.trim().slice(0, 128)
    if (trimmed.length === 0) continue
    const key = normalizeAnswer(trimmed) || trimmed.toLocaleLowerCase()
    if (!unique.some((entry) => (normalizeAnswer(entry) || entry.toLocaleLowerCase()) === key)) {
      unique.push(trimmed)
    }
    if (unique.length >= 8) break
  }
  return unique.length === 0 ? undefined : unique
}

function answerVariantKey(value: string): string {
  return normalizeAnswer(value) || value.trim().toLocaleLowerCase()
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
