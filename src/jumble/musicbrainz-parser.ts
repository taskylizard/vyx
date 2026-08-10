import { z } from 'zod'
import { createAnswerVariants, mergeAnswerVariantLists, mergeImageUrlLists } from './candidate.ts'
import type { JumbleArtistMetadata } from './types.ts'
import {
  MusicBrainzEnvelopeSchema,
  type MusicBrainzEnvelope,
  type RecordingMetadata,
  type ReleaseMetadata
} from './musicbrainz-types.ts'

const UnknownArraySchema = z.array(z.unknown()).catch([])
const MusicBrainzEnvelopeArraySchema = z.array(MusicBrainzEnvelopeSchema).catch([])
const OptionalMusicBrainzTextSchema = z.unknown().transform((value): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
})
const MusicBrainzNumberSchema = z.unknown().transform((value): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return 0

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
})
const CoverArtArchiveSchema = z.object({ front: z.boolean().optional() })

export function parseArtist(payload: MusicBrainzEnvelope | null): JumbleArtistMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const lifeSpan = MusicBrainzEnvelopeSchema.safeParse(payload['life-span'])
  const aliases = parseAliasEntries(payload.aliases)
  return {
    mbid: OptionalMusicBrainzTextSchema.parse(payload.id),
    type: OptionalMusicBrainzTextSchema.parse(payload.type),
    countryCode: OptionalMusicBrainzTextSchema.parse(payload.country),
    startDate: lifeSpan.success
      ? OptionalMusicBrainzTextSchema.parse(lifeSpan.data.begin)
      : undefined,
    endDate: lifeSpan.success ? OptionalMusicBrainzTextSchema.parse(lifeSpan.data.end) : undefined,
    disambiguation: OptionalMusicBrainzTextSchema.parse(payload.disambiguation),
    tags: parseNames(payload.tags),
    ...(aliases.length === 0 ? {} : { aliases })
  }
}

export function chooseArtist(
  payload: MusicBrainzEnvelope | null,
  name: string
): JumbleArtistMetadata | undefined {
  const artists = MusicBrainzEnvelopeArraySchema.parse(payload?.artists)
  const exact = artists
    .filter(
      (artist) =>
        OptionalMusicBrainzTextSchema.parse(artist.name)?.localeCompare(name, undefined, {
          sensitivity: 'base'
        }) === 0 || aliasMatches(artist.aliases, name)
    )
    .toSorted(
      (first, second) =>
        MusicBrainzNumberSchema.parse(second.score) - MusicBrainzNumberSchema.parse(first.score)
    )[0]
  return parseArtist(exact)
}

export function parseRelease(payload: MusicBrainzEnvelope | null): ReleaseMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const groupResult = MusicBrainzEnvelopeSchema.safeParse(payload['release-group'])
  const group = groupResult.success ? groupResult.data : undefined
  const labelInfo = MusicBrainzEnvelopeArraySchema.parse(payload['label-info'])[0]
  const labelResult = MusicBrainzEnvelopeSchema.safeParse(labelInfo.label)
  const label = labelResult.success
    ? OptionalMusicBrainzTextSchema.parse(labelResult.data.name)
    : undefined
  const title = OptionalMusicBrainzTextSchema.parse(payload.title)
  const aliases = [
    ...parseAliasEntries(payload.aliases),
    ...(group === undefined ? [] : parseAliasEntries(group.aliases))
  ]
  const mbid = OptionalMusicBrainzTextSchema.parse(payload.id)
  return {
    mbid,
    releaseGroupMbid:
      group === undefined ? undefined : OptionalMusicBrainzTextSchema.parse(group.id),
    releaseDate:
      OptionalMusicBrainzTextSchema.parse(payload.date) ??
      (group === undefined
        ? undefined
        : OptionalMusicBrainzTextSchema.parse(group['first-release-date'])),
    releaseType: group === undefined ? undefined : releaseType(group),
    label,
    disambiguation:
      OptionalMusicBrainzTextSchema.parse(payload.disambiguation) ??
      (group === undefined ? undefined : OptionalMusicBrainzTextSchema.parse(group.disambiguation)),
    answerVariants: mergeAnswerVariantLists(
      title === undefined ? undefined : createAnswerVariants([title], 'musicbrainz'),
      createAnswerVariants(aliases, 'musicbrainz')
    ),
    imageUrls: coverArtUrls('release', mbid, hasFrontCover(payload))
  }
}

export function parseReleaseGroup(group: MusicBrainzEnvelope): ReleaseMetadata | undefined {
  if (typeof group.id !== 'string') return undefined
  const releaseGroupMbid = OptionalMusicBrainzTextSchema.parse(group.id)
  const title = OptionalMusicBrainzTextSchema.parse(group.title)
  const aliases = parseAliasEntries(group.aliases)
  return {
    releaseGroupMbid,
    releaseDate: OptionalMusicBrainzTextSchema.parse(group['first-release-date']),
    releaseType: releaseType(group),
    disambiguation: OptionalMusicBrainzTextSchema.parse(group.disambiguation),
    answerVariants: mergeAnswerVariantLists(
      title === undefined ? undefined : createAnswerVariants([title], 'musicbrainz'),
      createAnswerVariants(aliases, 'musicbrainz')
    ),
    imageUrls: coverArtUrls('release-group', releaseGroupMbid, hasFrontCover(group))
  }
}

export function parseRecording(payload: MusicBrainzEnvelope | null): RecordingMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const releases = MusicBrainzEnvelopeArraySchema.parse(payload.releases)
  const firstRelease = chooseEarliestRelease(releases)
  const groupResult = MusicBrainzEnvelopeSchema.safeParse(firstRelease?.['release-group'])
  const group = groupResult.success ? groupResult.data : undefined
  const release = firstRelease === undefined ? undefined : parseRelease(firstRelease)
  const title = OptionalMusicBrainzTextSchema.parse(payload.title)
  const aliases = parseAliasEntries(payload.aliases)
  const releaseTitle =
    firstRelease === undefined
      ? undefined
      : (OptionalMusicBrainzTextSchema.parse(firstRelease.title) ??
        (group === undefined ? undefined : OptionalMusicBrainzTextSchema.parse(group.title)))
  return {
    mbid: OptionalMusicBrainzTextSchema.parse(payload.id),
    releaseDate:
      OptionalMusicBrainzTextSchema.parse(payload['first-release-date']) ?? release?.releaseDate,
    releaseType: release?.releaseType ?? (group === undefined ? undefined : releaseType(group)),
    label: release?.label,
    disambiguation: OptionalMusicBrainzTextSchema.parse(payload.disambiguation),
    durationMs: MusicBrainzNumberSchema.parse(payload.length),
    albumName: releaseTitle,
    releaseMbid:
      release?.mbid ??
      (firstRelease === undefined
        ? undefined
        : OptionalMusicBrainzTextSchema.parse(firstRelease.id)),
    releaseGroupMbid:
      release?.releaseGroupMbid ??
      (group === undefined ? undefined : OptionalMusicBrainzTextSchema.parse(group.id)),
    answerVariants: mergeAnswerVariantLists(
      title === undefined ? undefined : createAnswerVariants([title], 'musicbrainz'),
      createAnswerVariants(aliases, 'musicbrainz')
    ),
    imageUrls: release?.imageUrls
  }
}

export function chooseReleaseGroup(
  payload: MusicBrainzEnvelope | null,
  name: string,
  artistName: string | undefined
): MusicBrainzEnvelope | undefined {
  const groups = MusicBrainzEnvelopeArraySchema.parse(payload?.['release-groups'])
  return groups
    .filter(
      (group) =>
        OptionalMusicBrainzTextSchema.parse(group.title)?.localeCompare(name, undefined, {
          sensitivity: 'base'
        }) === 0 || aliasMatches(group.aliases, name)
    )
    .filter(
      (group) => artistName === undefined || artistCreditMatches(group['artist-credit'], artistName)
    )
    .toSorted(
      (first, second) =>
        MusicBrainzNumberSchema.parse(second.score) - MusicBrainzNumberSchema.parse(first.score)
    )[0]
}

export function chooseRecording(
  payload: MusicBrainzEnvelope | null,
  name: string,
  artistName: string | undefined
): MusicBrainzEnvelope | null {
  const recordings = MusicBrainzEnvelopeArraySchema.parse(payload?.recordings)
  return (
    recordings
      .filter(
        (recording) =>
          OptionalMusicBrainzTextSchema.parse(recording.title)?.localeCompare(name, undefined, {
            sensitivity: 'base'
          }) === 0 || aliasMatches(recording.aliases, name)
      )
      .filter(
        (recording) =>
          artistName === undefined || artistCreditMatches(recording['artist-credit'], artistName)
      )
      .toSorted((first, second) => {
        const firstLive = Number(
          OptionalMusicBrainzTextSchema.parse(first.disambiguation)?.toLowerCase().includes('live')
        )
        const secondLive = Number(
          OptionalMusicBrainzTextSchema.parse(second.disambiguation)?.toLowerCase().includes('live')
        )
        return (
          firstLive - secondLive ||
          MusicBrainzNumberSchema.parse(second.score) - MusicBrainzNumberSchema.parse(first.score)
        )
      })[0] ?? null
  )
}

export function firstReleaseId(group: MusicBrainzEnvelope): string | undefined {
  return MusicBrainzEnvelopeArraySchema.parse(group.releases)
    .map((release) => OptionalMusicBrainzTextSchema.parse(release.id))
    .find(Boolean)
}

export function mergeRelease(
  first: ReleaseMetadata | undefined,
  second: ReleaseMetadata | undefined
): ReleaseMetadata | undefined {
  if (first === undefined) return second
  if (second === undefined) return first
  return {
    mbid: second.mbid ?? first.mbid,
    releaseGroupMbid: first.releaseGroupMbid ?? second.releaseGroupMbid,
    releaseDate: first.releaseDate ?? second.releaseDate,
    releaseType: first.releaseType ?? second.releaseType,
    label: first.label ?? second.label,
    disambiguation: first.disambiguation ?? second.disambiguation,
    answerVariants: mergeAnswerVariantLists(first.answerVariants, second.answerVariants),
    imageUrls: mergeImageUrlLists(second.imageUrls, first.imageUrls)
  }
}

export function mergeMusicBrainzTags(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])]
  const unique = [
    ...new Map(values.map((value) => [normalizeMusicBrainzKey(value), value])).values()
  ]
  return unique.length === 0 ? undefined : unique.slice(0, 8)
}

export function normalizeMusicBrainzKey(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
}

export function isMusicBrainzId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}

function chooseEarliestRelease(
  releases: readonly MusicBrainzEnvelope[]
): MusicBrainzEnvelope | undefined {
  return [...releases]
    .filter((release) => OptionalMusicBrainzTextSchema.parse(release.date) !== undefined)
    .toSorted((first, second) => {
      const firstOfficial = Number(
        OptionalMusicBrainzTextSchema.parse(first.status)?.toLowerCase() === 'official'
      )
      const secondOfficial = Number(
        OptionalMusicBrainzTextSchema.parse(second.status)?.toLowerCase() === 'official'
      )
      return firstOfficial - secondOfficial || String(first.date).localeCompare(String(second.date))
    })[0]
}

function releaseType(group: MusicBrainzEnvelope): string | undefined {
  const primary = OptionalMusicBrainzTextSchema.parse(group['primary-type'])
  const secondary = UnknownArraySchema.parse(group['secondary-types']).filter(
    (value): value is string => typeof value === 'string'
  )
  if (primary === undefined) return undefined
  return secondary.length === 0 ? primary : `${primary} (${secondary.join(', ')})`
}

function artistCreditMatches(value: unknown, artistName: string): boolean {
  return MusicBrainzEnvelopeArraySchema.parse(value).some((credit) => {
    const artistResult = MusicBrainzEnvelopeSchema.safeParse(credit.artist)
    const artistEntry = artistResult.success ? artistResult.data : undefined
    const artist =
      artistEntry === undefined ? undefined : OptionalMusicBrainzTextSchema.parse(artistEntry.name)
    return (
      OptionalMusicBrainzTextSchema.parse(credit.name)?.localeCompare(artistName, undefined, {
        sensitivity: 'base'
      }) === 0 ||
      artist?.localeCompare(artistName, undefined, { sensitivity: 'base' }) === 0 ||
      aliasMatches(artistEntry?.aliases, artistName)
    )
  })
}

function aliasMatches(value: unknown, expected: string): boolean {
  return parseAliasEntries(value, 32).some(
    (alias) => alias.localeCompare(expected, undefined, { sensitivity: 'base' }) === 0
  )
}

function parseNames(value: unknown): string[] | undefined {
  const names = MusicBrainzEnvelopeArraySchema.parse(value)
    .map((entry) => OptionalMusicBrainzTextSchema.parse(entry.name))
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names.slice(0, 8)
}

function parseAliasEntries(value: unknown, limit = 8): string[] {
  return MusicBrainzEnvelopeArraySchema.parse(value)
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map((entry) => OptionalMusicBrainzTextSchema.parse(entry.name))
    .filter((name): name is string => name !== undefined)
}

function coverArtUrls(
  entity: 'release' | 'release-group',
  mbid: string | undefined,
  frontAvailable: boolean
): string[] | undefined {
  if (!frontAvailable || !isMusicBrainzId(mbid)) return undefined
  return [`https://coverartarchive.org/${entity}/${encodeURIComponent(mbid)}/front-500`]
}

function hasFrontCover(payload: MusicBrainzEnvelope): boolean {
  const archive = CoverArtArchiveSchema.safeParse(payload['cover-art-archive'])
  return archive.success && (archive.data.front ?? false)
}
