import { match } from 'ts-pattern'
import type { JumbleArtistMetadata, JumbleCandidate } from './types.ts'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import { readBoundedJson } from './response.ts'

const DEFAULT_BASE_URL = 'https://musicbrainz.org/ws/2'
const DEFAULT_USER_AGENT = 'Kanikou/0.0.0 (https://github.com/taskylizard/kanikou)'
const ARTIST_TTL_MS = 90 * 24 * 60 * 60 * 1_000
const RELEASE_TTL_MS = 90 * 24 * 60 * 60 * 1_000
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1_000

export interface MusicBrainzClientOptions {
  cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  fetchImpl?: typeof fetch
  baseUrl?: string
  userAgent?: string
  timeoutMs?: number
  minIntervalMs?: number
  maxPending?: number
  maxResponseBytes?: number
  now?: () => number
  onError?: (error: unknown) => void
}

interface MusicBrainzEnvelope {
  [key: string]: unknown
}

interface ReleaseMetadata {
  releaseDate?: string
  releaseType?: string
  label?: string
  disambiguation?: string
  mbid?: string
}

interface RecordingMetadata extends ReleaseMetadata {
  durationMs?: number
  albumName?: string
}

interface CachedValue<T> {
  found: boolean
  value?: T
}

interface CachedLookup<T> {
  fresh: boolean
  found: boolean
  value?: T
}

/**
 * Small, read-only MusicBrainz enrichment client.
 *
 * It only looks up the selected answer, never the complete Last.fm list. A
 * shared request gate keeps us within MusicBrainz's courtesy rate while an
 * in-flight map prevents duplicate lookups when several games choose the same
 * item at once.
 */
export class MusicBrainzClient {
  private readonly cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly minIntervalMs: number
  private readonly maxPending: number
  private readonly maxResponseBytes: number
  private readonly now: () => number
  private readonly onError?: (error: unknown) => void
  private readonly inflight = new Map<string, Promise<MusicBrainzEnvelope | null>>()
  private queueTail: Promise<void> = Promise.resolve()
  private nextRequestAt = 0
  private pending = 0

  constructor(options: MusicBrainzClientOptions = {}) {
    this.cache = options.cache
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.timeoutMs = Math.max(500, Math.trunc(options.timeoutMs ?? 8_000))
    this.minIntervalMs = Math.max(250, Math.trunc(options.minIntervalMs ?? 1_100))
    this.maxPending = Math.max(1, Math.trunc(options.maxPending ?? 32))
    this.maxResponseBytes = Math.max(
      16 * 1024,
      Math.trunc(options.maxResponseBytes ?? 1_024 * 1_024)
    )
    this.now = options.now ?? Date.now
    this.onError = options.onError
  }

  async enrich(candidate: JumbleCandidate): Promise<JumbleCandidate> {
    try {
      const artistName = match(candidate.kind)
        .with('artist', () => candidate.answer)
        .with('album', 'track', () => candidate.artistName)
        .exhaustive()
      const artistPromise =
        artistName === undefined
          ? Promise.resolve(undefined)
          : this.getArtist(
              artistName,
              match(candidate.kind)
                .with('artist', () => candidate.mbid)
                .with('album', 'track', () => undefined)
                .exhaustive()
            )
      const itemPromise: Promise<ReleaseMetadata | RecordingMetadata | undefined> = match(
        candidate.kind
      )
        .with('artist', () => Promise.resolve(undefined))
        .with('album', () => this.getRelease(candidate.answer, artistName, candidate.mbid))
        .with('track', () => this.getRecording(candidate.answer, artistName, candidate.mbid))
        .exhaustive()
      const [artistMetadata, itemMetadata] = await Promise.all([artistPromise, itemPromise])

      const next: JumbleCandidate = { ...candidate }
      if (artistMetadata !== undefined) next.artistMetadata = artistMetadata
      if (candidate.kind === 'artist' && artistMetadata !== undefined) {
        next.mbid = candidate.mbid ?? artistMetadata.mbid
        next.disambiguation = candidate.disambiguation ?? artistMetadata.disambiguation
        next.tags = mergeTags(candidate.tags, artistMetadata.tags)
        next.startDate = candidate.startDate ?? artistMetadata.startDate
        next.endDate = candidate.endDate ?? artistMetadata.endDate
        next.countryCode = candidate.countryCode ?? artistMetadata.countryCode
        next.entityType = candidate.entityType ?? artistMetadata.type
      }
      if (itemMetadata !== undefined) {
        next.mbid = candidate.mbid ?? itemMetadata.mbid
        next.releaseDate = candidate.releaseDate ?? itemMetadata.releaseDate
        next.releaseType = candidate.releaseType ?? itemMetadata.releaseType
        next.label = candidate.label ?? itemMetadata.label
        next.disambiguation = candidate.disambiguation ?? itemMetadata.disambiguation
        if (candidate.kind === 'track') {
          const recordingMetadata = 'durationMs' in itemMetadata ? itemMetadata : undefined
          next.durationMs = candidate.durationMs ?? recordingMetadata?.durationMs
          next.albumName = candidate.albumName ?? recordingMetadata?.albumName
        }
      }
      return next
    } catch (error) {
      this.report(error)
      return candidate
    }
  }

  private async getArtist(name: string, mbid?: string): Promise<JumbleArtistMetadata | undefined> {
    const cacheKey = `musicbrainz:artist:${mbid ?? normalizeKey(name)}`
    const cached = await this.readCache<JumbleArtistMetadata>(cacheKey)
    if (cached?.fresh) return cached.found ? cached.value : undefined

    let result: JumbleArtistMetadata | undefined
    if (isMbid(mbid)) {
      const payload = await this.request(`/artist/${encodeURIComponent(mbid)}`)
      result = parseArtist(payload)
    }
    if (result === undefined) {
      const payload = await this.request('/artist/', {
        query: `artist:"${escapeLucene(name)}"`,
        limit: '5'
      })
      result = chooseArtist(payload, name)
    }

    if (result === undefined) {
      await this.writeCache(cacheKey, { found: false }, NEGATIVE_TTL_MS)
      return undefined
    }
    await this.writeCache(cacheKey, { found: true, value: result }, ARTIST_TTL_MS)
    return result
  }

  private async getRelease(
    name: string,
    artistName: string | undefined,
    mbid?: string
  ): Promise<ReleaseMetadata | undefined> {
    const cacheKey = `musicbrainz:release:${mbid ?? `${normalizeKey(artistName ?? '')}:${normalizeKey(name)}`}`
    const cached = await this.readCache<ReleaseMetadata>(cacheKey)
    if (cached?.fresh) return cached.found ? cached.value : undefined

    let result: ReleaseMetadata | undefined
    if (isMbid(mbid)) {
      result = parseRelease(
        await this.request(`/release/${encodeURIComponent(mbid)}`, { inc: 'release-groups+labels' })
      )
    }
    if (result === undefined) {
      const payload = await this.request('/release-group/', {
        query: `releasegroup:"${escapeLucene(name)}"${artistName === undefined ? '' : ` AND artist:"${escapeLucene(artistName)}"`}`,
        limit: '5'
      })
      const group = chooseReleaseGroup(payload, name, artistName)
      if (group !== undefined) {
        result = parseReleaseGroup(group)
        const releaseId = firstReleaseId(group)
        if (releaseId !== undefined) {
          const release = parseRelease(
            await this.request(`/release/${encodeURIComponent(releaseId)}`, {
              inc: 'release-groups+labels'
            })
          )
          result = mergeRelease(result, release)
        }
      }
    }

    if (result === undefined) {
      await this.writeCache(cacheKey, { found: false }, NEGATIVE_TTL_MS)
      return undefined
    }
    await this.writeCache(cacheKey, { found: true, value: result }, RELEASE_TTL_MS)
    return result
  }

  private async getRecording(
    name: string,
    artistName: string | undefined,
    mbid?: string
  ): Promise<RecordingMetadata | undefined> {
    const cacheKey = `musicbrainz:recording:${mbid ?? `${normalizeKey(artistName ?? '')}:${normalizeKey(name)}`}`
    const cached = await this.readCache<RecordingMetadata>(cacheKey)
    if (cached?.fresh) return cached.found ? cached.value : undefined

    let result: RecordingMetadata | undefined
    if (isMbid(mbid)) {
      result = parseRecording(
        await this.request(`/recording/${encodeURIComponent(mbid)}`, { inc: 'releases' })
      )
    }
    if (result === undefined) {
      const payload = await this.request('/recording/', {
        query: `recording:"${escapeLucene(name)}"${artistName === undefined ? '' : ` AND artist:"${escapeLucene(artistName)}"`}`,
        limit: '10'
      })
      const recording = chooseRecording(payload, name, artistName)
      result = parseRecording(recording)
    }

    if (result === undefined) {
      await this.writeCache(cacheKey, { found: false }, NEGATIVE_TTL_MS)
      return undefined
    }
    await this.writeCache(cacheKey, { found: true, value: result }, RELEASE_TTL_MS)
    return result
  }

  private async readCache<T>(cacheKey: string): Promise<CachedLookup<T> | null> {
    if (this.cache === undefined) return null
    const entry = await this.cache.get<CachedValue<T>>(cacheKey)
    if (entry === null) return null
    return {
      fresh: entry.fresh,
      found: entry.value.found === true,
      value: entry.value.value
    }
  }

  private async writeCache<T>(
    cacheKey: string,
    value: CachedValue<T>,
    ttlMs: number
  ): Promise<void> {
    if (this.cache === undefined) return
    await this.cache.set(cacheKey, value, ttlMs)
  }

  private async request(
    path: string,
    params: Record<string, string> = {}
  ): Promise<MusicBrainzEnvelope | null> {
    const query = new URLSearchParams({ fmt: 'json', ...params })
    const url = `${this.baseUrl}${path}?${query.toString()}`
    const existing = this.inflight.get(url)
    if (existing !== undefined) return existing
    if (this.pending >= this.maxPending) return null

    const task = this.enqueue(url)
    this.inflight.set(url, task)
    try {
      return await task
    } finally {
      this.inflight.delete(url)
    }
  }

  private async enqueue(url: string): Promise<MusicBrainzEnvelope | null> {
    this.pending += 1
    let release!: () => void
    const previous = this.queueTail
    this.queueTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const waitMs = Math.max(0, this.nextRequestAt - this.now())
      if (waitMs > 0) await delay(waitMs)
      this.nextRequestAt = this.now() + this.minIntervalMs

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            accept: 'application/json',
            'user-agent': this.userAgent
          },
          signal: controller.signal
        })
        if (!response.ok) return null
        const length = Number(response.headers.get('content-length') ?? 0)
        if (length > this.maxResponseBytes) return null
        const payload: unknown = await readBoundedJson(response, this.maxResponseBytes)
        return isRecord(payload) ? payload : null
      } catch (error) {
        this.report(error)
        return null
      } finally {
        clearTimeout(timer)
      }
    } finally {
      this.pending -= 1
      release()
    }
  }

  private report(error: unknown): void {
    this.onError?.(error)
  }
}

function parseArtist(payload: MusicBrainzEnvelope | null): JumbleArtistMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const lifeSpan = isRecord(payload['life-span']) ? payload['life-span'] : undefined
  return {
    mbid: stringValue(payload.id),
    type: stringValue(payload.type),
    countryCode: stringValue(payload.country),
    startDate: lifeSpan === undefined ? undefined : stringValue(lifeSpan.begin),
    endDate: lifeSpan === undefined ? undefined : stringValue(lifeSpan.end),
    disambiguation: stringValue(payload.disambiguation),
    tags: parseNames(payload.tags)
  }
}

function chooseArtist(
  payload: MusicBrainzEnvelope | null,
  name: string
): JumbleArtistMetadata | undefined {
  const artists = arrayValue(payload?.artists)
  const exact = artists
    .filter(isRecord)
    .filter(
      (artist) =>
        stringValue(artist.name)?.localeCompare(name, undefined, { sensitivity: 'base' }) === 0
    )
    .sort((first, second) => numberValue(second.score) - numberValue(first.score))[0]
  return parseArtist(exact ?? artists.find(isRecord) ?? null)
}

function parseRelease(payload: MusicBrainzEnvelope | null): ReleaseMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const group = isRecord(payload['release-group']) ? payload['release-group'] : undefined
  const labelInfo = arrayValue(payload['label-info']).find(isRecord)
  const label =
    labelInfo !== undefined && isRecord(labelInfo.label)
      ? stringValue(labelInfo.label.name)
      : undefined
  return {
    mbid: stringValue(payload.id),
    releaseDate:
      stringValue(payload.date) ??
      (group === undefined ? undefined : stringValue(group['first-release-date'])),
    releaseType: group === undefined ? undefined : releaseType(group),
    label,
    disambiguation:
      stringValue(payload.disambiguation) ??
      (group === undefined ? undefined : stringValue(group.disambiguation))
  }
}

function parseReleaseGroup(group: MusicBrainzEnvelope): ReleaseMetadata | undefined {
  if (typeof group.id !== 'string') return undefined
  return {
    mbid: stringValue(group.id),
    releaseDate: stringValue(group['first-release-date']),
    releaseType: releaseType(group),
    disambiguation: stringValue(group.disambiguation)
  }
}

function parseRecording(payload: MusicBrainzEnvelope | null): RecordingMetadata | undefined {
  if (payload === null || typeof payload.id !== 'string') return undefined
  const releases = arrayValue(payload.releases).filter(isRecord)
  const firstRelease = chooseEarliestRelease(releases)
  const group =
    firstRelease !== undefined && isRecord(firstRelease['release-group'])
      ? firstRelease['release-group']
      : undefined
  const release = firstRelease === undefined ? undefined : parseRelease(firstRelease)
  return {
    mbid: stringValue(payload.id),
    releaseDate: stringValue(payload['first-release-date']) ?? release?.releaseDate,
    releaseType: release?.releaseType ?? (group === undefined ? undefined : releaseType(group)),
    label: release?.label,
    disambiguation: stringValue(payload.disambiguation),
    durationMs: numberValue(payload.length),
    albumName:
      firstRelease === undefined
        ? undefined
        : (stringValue(firstRelease.title) ??
          (group === undefined ? undefined : stringValue(group.title)))
  }
}

function chooseReleaseGroup(
  payload: MusicBrainzEnvelope | null,
  name: string,
  artistName: string | undefined
): MusicBrainzEnvelope | undefined {
  const groups = arrayValue(payload?.['release-groups']).filter(isRecord)
  return groups
    .filter(
      (group) =>
        stringValue(group.title)?.localeCompare(name, undefined, { sensitivity: 'base' }) === 0
    )
    .filter(
      (group) => artistName === undefined || artistCreditMatches(group['artist-credit'], artistName)
    )
    .sort((first, second) => numberValue(second.score) - numberValue(first.score))[0]
}

function chooseRecording(
  payload: MusicBrainzEnvelope | null,
  name: string,
  artistName: string | undefined
): MusicBrainzEnvelope | null {
  const recordings = arrayValue(payload?.recordings).filter(isRecord)
  return (
    recordings
      .filter(
        (recording) =>
          stringValue(recording.title)?.localeCompare(name, undefined, { sensitivity: 'base' }) ===
          0
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

function firstReleaseId(group: MusicBrainzEnvelope): string | undefined {
  return arrayValue(group.releases)
    .filter(isRecord)
    .map((release) => stringValue(release.id))
    .find(Boolean)
}

function mergeRelease(
  first: ReleaseMetadata | undefined,
  second: ReleaseMetadata | undefined
): ReleaseMetadata | undefined {
  if (first === undefined) return second
  if (second === undefined) return first
  return {
    mbid: first.mbid ?? second.mbid,
    releaseDate: first.releaseDate ?? second.releaseDate,
    releaseType: first.releaseType ?? second.releaseType,
    label: first.label ?? second.label,
    disambiguation: first.disambiguation ?? second.disambiguation
  }
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
    if (!isRecord(credit)) return false
    const artist = isRecord(credit.artist) ? stringValue(credit.artist.name) : undefined
    return (
      stringValue(credit.name)?.localeCompare(artistName, undefined, { sensitivity: 'base' }) ===
        0 || artist?.localeCompare(artistName, undefined, { sensitivity: 'base' }) === 0
    )
  })
}

function parseNames(value: unknown): string[] | undefined {
  const names = arrayValue(value)
    .filter(isRecord)
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names.slice(0, 8)
}

function mergeTags(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])]
  const unique = [...new Map(values.map((value) => [normalizeKey(value), value])).values()]
  return unique.length === 0 ? undefined : unique.slice(0, 8)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is MusicBrainzEnvelope {
  return typeof value === 'object' && value !== null
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

function isMbid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
}

function escapeLucene(value: string): string {
  return value.replace(/[+\-!(){}[\]^"~*?:\\/]/gu, '\\$&')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
