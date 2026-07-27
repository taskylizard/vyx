import { match, P } from 'ts-pattern'
import { normalizeAnswer } from './answer.ts'
import { createAnswerVariants, mergeAnswerVariantLists, mergeImageUrlLists } from './candidate.ts'
import type { LastFmEnvelope, LastFmImage } from './lastfm-types.ts'
import type { JumbleArtistMetadata, JumbleCandidate, JumbleKind } from './types.ts'

export function parseLastFmTopItems(payload: LastFmEnvelope, kind: JumbleKind): JumbleCandidate[] {
  const container = match(kind)
    .with('artist', () => payload.topartists)
    .with('album', () => payload.topalbums)
    .with('track', () => payload.toptracks)
    .exhaustive()
  if (!isLastFmObject(container)) return []
  const rawItems = Array.isArray(container[kind]) ? container[kind].slice(0, 200) : []
  return rawItems.flatMap((raw) => parseTopItem(raw, kind))
}

export function mergeLastFmDetails(
  candidate: JumbleCandidate,
  payload: LastFmEnvelope
): JumbleCandidate {
  const root = payload[candidate.kind]
  if (!isLastFmObject(root)) return candidate
  const tags =
    isLastFmObject(root.tags) && Array.isArray(root.tags.tag)
      ? root.tags.tag
          .slice(0, 16)
          .flatMap((tag) =>
            isLastFmObject(tag) && parseLastFmString(tag.name) !== undefined
              ? [parseLastFmString(tag.name)!]
              : []
          )
      : undefined
  const wiki = isLastFmObject(root.wiki) ? parseLastFmString(root.wiki.summary) : undefined
  const releaseDate = parseLastFmString(root.releasedate) ?? parseLastFmString(root.date)
  const artistName =
    parseLastFmString(root.artist) ??
    (isLastFmObject(root.artist) ? parseLastFmString(root.artist.name) : undefined)
  const albumName =
    parseLastFmString(root.album) ??
    (isLastFmObject(root.album)
      ? (parseLastFmString(root.album.title) ?? parseLastFmString(root.album.name))
      : undefined)
  const duration = parseLastFmNumber(root.duration)
  const stats = isLastFmObject(root.stats) ? root.stats : undefined
  const nestedAlbumImages = match(candidate)
    .returnType<string[]>()
    .with({ kind: 'track' }, () =>
      isLastFmObject(root.album) ? firstImages(root.album.image) : []
    )
    .with({ kind: P.union('artist', 'album') }, () => [])
    .exhaustive()
  const imageUrls = mergeImageUrlLists(
    candidate.imageUrl === undefined ? undefined : [candidate.imageUrl],
    candidate.imageUrls,
    firstImages(root.image),
    nestedAlbumImages
  )
  const answerVariants = mergeAnswerVariantLists(
    candidate.answerVariants,
    createAnswerVariants(parseAliasValues(root.aliases), 'lastfm')
  )
  const common = {
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length === 0 ? undefined : imageUrls,
    answerVariants,
    mbid: candidate.mbid ?? parseLastFmString(root.mbid),
    playcount:
      candidate.playcount ??
      parseLastFmNumber(root.playcount) ??
      parseLastFmNumber(stats?.playcount),
    listeners:
      candidate.listeners ??
      parseLastFmNumber(root.listeners) ??
      parseLastFmNumber(stats?.listeners),
    tags: tags === undefined || tags.length === 0 ? candidate.tags : tags,
    summary: candidate.summary ?? wiki
  }

  return match(candidate)
    .returnType<JumbleCandidate>()
    .with({ kind: 'artist' }, (artist) => ({ ...artist, ...common }))
    .with({ kind: 'album' }, (album) => ({
      ...album,
      ...common,
      artistName: album.artistName ?? artistName,
      albumName: album.albumName ?? albumName,
      releaseDate: album.releaseDate ?? releaseDate,
      durationMs: album.durationMs ?? duration
    }))
    .with({ kind: 'track' }, (track) => ({
      ...track,
      ...common,
      artistName: track.artistName ?? artistName,
      albumName: track.albumName ?? albumName,
      releaseDate: track.releaseDate ?? releaseDate,
      durationMs: track.durationMs ?? duration
    }))
    .exhaustive()
}

export function mergeLastFmArtistDetails(
  candidate: JumbleCandidate,
  payload: LastFmEnvelope
): JumbleCandidate {
  const root = payload.artist
  if (!isLastFmObject(root)) return candidate
  const tags = parseTags(root.tags)
  const stats = isLastFmObject(root.stats) ? root.stats : undefined
  const aliases = parseAliasValues(root.aliases)
  const metadata: JumbleArtistMetadata = {
    mbid: parseLastFmString(root.mbid),
    tags,
    summary: isLastFmObject(root.bio) ? parseLastFmString(root.bio.summary) : undefined,
    countryCode: undefined,
    ...(aliases.length === 0 ? {} : { aliases })
  }
  const artistMetadata = {
    ...candidate.artistMetadata,
    ...metadata,
    tags: mergeTagValues(candidate.artistMetadata?.tags, tags),
    aliases: mergeTagValues(candidate.artistMetadata?.aliases, aliases),
    summary: candidate.artistMetadata?.summary ?? metadata.summary
  }

  return match(candidate)
    .returnType<JumbleCandidate>()
    .with({ kind: 'artist' }, (artist) => ({
      ...artist,
      artistMetadata,
      mbid: artist.mbid ?? metadata.mbid,
      playcount:
        artist.playcount ??
        parseLastFmNumber(root.playcount) ??
        parseLastFmNumber(stats?.playcount),
      listeners:
        artist.listeners ?? parseLastFmNumber(root.listeners) ?? parseLastFmNumber(stats?.listeners)
    }))
    .with({ kind: 'album' }, { kind: 'track' }, (release) => ({
      ...release,
      artistMetadata
    }))
    .exhaustive()
}

export function normalizeLastFmUsername(value: string): string {
  return value.trim().replace(/^@/u, '').slice(0, 64)
}

export function isLastFmObject(value: unknown): value is LastFmEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if ('error' in value && value.error !== undefined && typeof value.error !== 'number') {
    return false
  }
  return !('message' in value) || value.message === undefined || typeof value.message === 'string'
}

export function parseLastFmString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 512)
}

function parseTopItem(value: unknown, kind: JumbleKind): JumbleCandidate[] {
  if (!isLastFmObject(value)) return []
  const answer = parseLastFmString(value.name)
  if (answer === undefined || answer.trim().length < 2) return []
  const listedArtist = isLastFmObject(value.artist)
    ? parseLastFmString(value.artist.name)
    : parseLastFmString(value.artist)
  const listedAlbum = isLastFmObject(value.album) ? parseLastFmString(value.album.name) : undefined
  const directImages = firstImages(value.image)
  const listedImages = mergeImageUrlLists(
    directImages,
    isLastFmObject(value.album) ? firstImages(value.album.image) : undefined
  )
  const common = {
    answer: answer.trim(),
    playcount: parseLastFmNumber(value.playcount),
    listeners: parseLastFmNumber(value.listeners),
    mbid: parseLastFmString(value.mbid),
    sourceUrl: parseLastFmString(value.url)
  }

  return [
    match(kind)
      .returnType<JumbleCandidate>()
      .with('artist', () => ({
        ...common,
        kind: 'artist',
        imageUrl: directImages[0],
        imageUrls: directImages
      }))
      .with('album', () => ({
        ...common,
        kind: 'album',
        albumName: answer.trim(),
        artistName: listedArtist,
        imageUrl: directImages[0],
        imageUrls: directImages,
        releaseDate: parseLastFmString(value.releasedate) ?? parseLastFmString(value.date),
        releaseType: parseLastFmString(value.type)
      }))
      .with('track', () => ({
        ...common,
        kind: 'track',
        albumName: listedAlbum,
        artistName: listedArtist,
        durationMs: parseLastFmNumber(value.duration),
        imageUrl: listedImages[0],
        imageUrls: listedImages,
        releaseDate: parseLastFmString(value.releasedate) ?? parseLastFmString(value.date)
      }))
      .exhaustive()
  ]
}

function parseTags(value: unknown): string[] | undefined {
  if (!isLastFmObject(value)) return undefined
  const tags = Array.isArray(value.tag) ? value.tag : []
  const names = tags
    .filter(isLastFmObject)
    .map((tag) => parseLastFmString(tag.name))
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names.slice(0, 8)
}

function mergeTagValues(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])]
  const unique = [...new Map(values.map((value) => [normalizeAnswer(value), value])).values()]
  return unique.length === 0 ? undefined : unique.slice(0, 8)
}

function firstImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ranked = value
    .filter((entry): entry is LastFmImage => isLastFmObject(entry))
    .sort((first, second) => imageRank(String(second.size)) - imageRank(String(first.size)))
  const urls: string[] = []
  for (const entry of ranked) {
    const url = parseLastFmString(entry['#text'])
    if (
      url !== undefined &&
      url.startsWith('http') &&
      !url.includes('2a96cbd8b46e442fc41c2b86b821562f') &&
      !urls.includes(url)
    )
      urls.push(url)
    if (urls.length >= 8) break
  }
  return urls
}

function parseAliasValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 16).flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    if (!isLastFmObject(entry)) return []
    const name = parseLastFmString(entry.name)
    return name === undefined ? [] : [name]
  })
}

function imageRank(size: string): number {
  return { mega: 5, extralarge: 4, large: 3, medium: 2, small: 1 }[size] ?? 0
}

function parseLastFmNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
