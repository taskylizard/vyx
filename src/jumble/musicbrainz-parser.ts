import { createAnswerVariants, mergeAnswerVariantLists, mergeImageUrlLists } from './candidate.ts'
import type { JumbleArtistMetadata } from './types.ts'
import type {
  MusicBrainzEnvelope,
  RecordingMetadata,
  ReleaseMetadata
} from './musicbrainz-types.ts'

export function parseArtist(payload: MusicBrainzEnvelope | null): JumbleArtistMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const lifeSpan = isMusicBrainzObject(payload['life-span']) ? payload['life-span'] : undefined
  const aliases = parseAliasEntries(payload.aliases)
  return {
    mbid: stringValue(payload.id),
    type: stringValue(payload.type),
    countryCode: stringValue(payload.country),
    startDate: lifeSpan === undefined ? undefined : stringValue(lifeSpan.begin),
    endDate: lifeSpan === undefined ? undefined : stringValue(lifeSpan.end),
    disambiguation: stringValue(payload.disambiguation),
    tags: parseNames(payload.tags),
    ...(aliases.length === 0 ? {} : { aliases })
  }
}

export function chooseArtist(
  payload: MusicBrainzEnvelope | null,
  name: string
): JumbleArtistMetadata | undefined {
  const artists = arrayValue(payload?.artists)
  const exact = artists
    .filter(isMusicBrainzObject)
    .filter(
      (artist) =>
        stringValue(artist.name)?.localeCompare(name, undefined, { sensitivity: 'base' }) === 0 ||
        aliasMatches(artist.aliases, name)
    )
    .sort((first, second) => numberValue(second.score) - numberValue(first.score))[0]
  return parseArtist(exact ?? null)
}

export function parseRelease(payload: MusicBrainzEnvelope | null): ReleaseMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const group = isMusicBrainzObject(payload['release-group']) ? payload['release-group'] : undefined
  const labelInfo = arrayValue(payload['label-info']).find(isMusicBrainzObject)
  const label =
    labelInfo !== undefined && isMusicBrainzObject(labelInfo.label)
      ? stringValue(labelInfo.label.name)
      : undefined
  const title = stringValue(payload.title)
  const aliases = [
    ...parseAliasEntries(payload.aliases),
    ...(group === undefined ? [] : parseAliasEntries(group.aliases))
  ]
  const mbid = stringValue(payload.id)
  return {
    mbid,
    releaseGroupMbid: group === undefined ? undefined : stringValue(group.id),
    releaseDate:
      stringValue(payload.date) ??
      (group === undefined ? undefined : stringValue(group['first-release-date'])),
    releaseType: group === undefined ? undefined : releaseType(group),
    label,
    disambiguation:
      stringValue(payload.disambiguation) ??
      (group === undefined ? undefined : stringValue(group.disambiguation)),
    answerVariants: mergeAnswerVariantLists(
      title === undefined ? undefined : createAnswerVariants([title], 'musicbrainz'),
      createAnswerVariants(aliases, 'musicbrainz')
    ),
    imageUrls: coverArtUrls('release', mbid)
  }
}

export function parseReleaseGroup(group: MusicBrainzEnvelope): ReleaseMetadata | undefined {
  if (typeof group.id !== 'string') return undefined
  const releaseGroupMbid = stringValue(group.id)
  const title = stringValue(group.title)
  const aliases = parseAliasEntries(group.aliases)
  return {
    releaseGroupMbid,
    releaseDate: stringValue(group['first-release-date']),
    releaseType: releaseType(group),
    disambiguation: stringValue(group.disambiguation),
    answerVariants: mergeAnswerVariantLists(
      title === undefined ? undefined : createAnswerVariants([title], 'musicbrainz'),
      createAnswerVariants(aliases, 'musicbrainz')
    ),
    imageUrls: coverArtUrls('release-group', releaseGroupMbid)
  }
}

export function parseRecording(payload: MusicBrainzEnvelope | null): RecordingMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const releases = arrayValue(payload.releases).filter(isMusicBrainzObject)
  const firstRelease = chooseEarliestRelease(releases)
  const group =
    firstRelease !== undefined && isMusicBrainzObject(firstRelease['release-group'])
      ? firstRelease['release-group']
      : undefined
  const release = firstRelease === undefined ? undefined : parseRelease(firstRelease)
  const title = stringValue(payload.title)
  const aliases = parseAliasEntries(payload.aliases)
  const releaseTitle =
    firstRelease === undefined
      ? undefined
      : (stringValue(firstRelease.title) ??
        (group === undefined ? undefined : stringValue(group.title)))
  return {
    mbid: stringValue(payload.id),
    releaseDate: stringValue(payload['first-release-date']) ?? release?.releaseDate,
    releaseType: release?.releaseType ?? (group === undefined ? undefined : releaseType(group)),
    label: release?.label,
    disambiguation: stringValue(payload.disambiguation),
    durationMs: numberValue(payload.length),
    albumName: releaseTitle,
    releaseMbid:
      release?.mbid ?? (firstRelease === undefined ? undefined : stringValue(firstRelease.id)),
    releaseGroupMbid:
      release?.releaseGroupMbid ?? (group === undefined ? undefined : stringValue(group.id)),
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
  const groups = arrayValue(payload?.['release-groups']).filter(isMusicBrainzObject)
  return groups
    .filter(
      (group) =>
        stringValue(group.title)?.localeCompare(name, undefined, { sensitivity: 'base' }) === 0 ||
        aliasMatches(group.aliases, name)
    )
    .filter(
      (group) => artistName === undefined || artistCreditMatches(group['artist-credit'], artistName)
    )
    .sort((first, second) => numberValue(second.score) - numberValue(first.score))[0]
}

export function chooseRecording(
  payload: MusicBrainzEnvelope | null,
  name: string,
  artistName: string | undefined
): MusicBrainzEnvelope | null {
  const recordings = arrayValue(payload?.recordings).filter(isMusicBrainzObject)
  return (
    recordings
      .filter(
        (recording) =>
          stringValue(recording.title)?.localeCompare(name, undefined, { sensitivity: 'base' }) ===
            0 || aliasMatches(recording.aliases, name)
      )
      .filter(
        (recording) =>
          artistName === undefined || artistCreditMatches(recording['artist-credit'], artistName)
      )
      .sort((first, second) => {
        const firstLive = stringValue(first.disambiguation)?.toLowerCase().includes('live') ? 1 : 0
        const secondLive = stringValue(second.disambiguation)?.toLowerCase().includes('live')
          ? 1
          : 0
        return firstLive - secondLive || numberValue(second.score) - numberValue(first.score)
      })[0] ?? null
  )
}

export function firstReleaseId(group: MusicBrainzEnvelope): string | undefined {
  return arrayValue(group.releases)
    .filter(isMusicBrainzObject)
    .map((release) => stringValue(release.id))
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

export function isMusicBrainzObject(value: unknown): value is MusicBrainzEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    .filter((release) => stringValue(release.date) !== undefined)
    .sort((first, second) => {
      const firstOfficial = stringValue(first.status)?.toLowerCase() === 'official' ? 0 : 1
      const secondOfficial = stringValue(second.status)?.toLowerCase() === 'official' ? 0 : 1
      return firstOfficial - secondOfficial || String(first.date).localeCompare(String(second.date))
    })[0]
}

function releaseType(group: MusicBrainzEnvelope): string | undefined {
  const primary = stringValue(group['primary-type'])
  const secondary = arrayValue(group['secondary-types']).filter(
    (value): value is string => typeof value === 'string'
  )
  if (primary === undefined) return undefined
  return secondary.length === 0 ? primary : `${primary} (${secondary.join(', ')})`
}

function artistCreditMatches(value: unknown, artistName: string): boolean {
  return arrayValue(value).some((credit) => {
    if (!isMusicBrainzObject(credit)) return false
    const artistEntry = isMusicBrainzObject(credit.artist) ? credit.artist : undefined
    const artist = artistEntry === undefined ? undefined : stringValue(artistEntry.name)
    return (
      stringValue(credit.name)?.localeCompare(artistName, undefined, { sensitivity: 'base' }) ===
        0 ||
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
  const names = arrayValue(value)
    .filter(isMusicBrainzObject)
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names.slice(0, 8)
}

function parseAliasEntries(value: unknown, limit = 8): string[] {
  return arrayValue(value)
    .slice(0, Math.max(0, Math.trunc(limit)))
    .filter(isMusicBrainzObject)
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function coverArtUrls(
  entity: 'release' | 'release-group',
  mbid: string | undefined
): string[] | undefined {
  if (!isMusicBrainzId(mbid)) return undefined
  return [`https://coverartarchive.org/${entity}/${encodeURIComponent(mbid)}/front-500`]
}
