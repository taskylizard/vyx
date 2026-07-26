import { match } from 'ts-pattern'
import type { ZodType } from 'zod'
import type { JumbleArtistMetadata, JumbleCandidate } from './types.ts'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import {
  chooseArtist,
  chooseRecording,
  chooseReleaseGroup,
  firstReleaseId,
  isMusicBrainzObject,
  mergeMusicBrainzTags,
  mergeRelease,
  normalizeMusicBrainzKey,
  parseArtist,
  parseRecording,
  parseRelease,
  parseReleaseGroup
} from './musicbrainz-parser.ts'
import {
  type CachedMusicBrainzLookup,
  type CachedMusicBrainzValue,
  type MusicBrainzClientOptions,
  type MusicBrainzEnvelope,
  RecordingMetadataSchema,
  type RecordingMetadata,
  ReleaseMetadataSchema,
  type ReleaseMetadata,
  musicBrainzCachedValueSchema
} from './musicbrainz-types.ts'
import { readBoundedJson } from './response.ts'
import { JumbleArtistMetadataSchema } from './schemas.ts'

const DEFAULT_BASE_URL = 'https://musicbrainz.org/ws/2'
const DEFAULT_USER_AGENT = 'Kanikou/0.0.0 (https://github.com/taskylizard/kanikou)'
const ARTIST_TTL_MS = 90 * 24 * 60 * 60 * 1_000
const RELEASE_TTL_MS = 90 * 24 * 60 * 60 * 1_000
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1_000

export type { MusicBrainzClientOptions } from './musicbrainz-types.ts'

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
      return await match(candidate)
        .returnType<Promise<JumbleCandidate>>()
        .with({ kind: 'artist' }, async (artist) => {
          const metadata = await this.getArtist(artist.answer, artist.mbid)
          if (metadata === undefined) return artist

          return {
            ...artist,
            artistMetadata: metadata,
            mbid: artist.mbid ?? metadata.mbid,
            disambiguation: artist.disambiguation ?? metadata.disambiguation,
            tags: mergeMusicBrainzTags(artist.tags, metadata.tags),
            startDate: artist.startDate ?? metadata.startDate,
            endDate: artist.endDate ?? metadata.endDate,
            countryCode: artist.countryCode ?? metadata.countryCode,
            entityType: artist.entityType ?? metadata.type
          }
        })
        .with({ kind: 'album' }, async (album) => {
          const [artistMetadata, releaseMetadata] = await Promise.all([
            album.artistName === undefined
              ? Promise.resolve(undefined)
              : this.getArtist(album.artistName),
            this.getRelease(album.answer, album.artistName, album.mbid)
          ])

          return {
            ...album,
            ...(artistMetadata === undefined ? {} : { artistMetadata }),
            ...(releaseMetadata === undefined
              ? {}
              : {
                  mbid: album.mbid ?? releaseMetadata.mbid,
                  releaseDate: album.releaseDate ?? releaseMetadata.releaseDate,
                  releaseType: album.releaseType ?? releaseMetadata.releaseType,
                  label: album.label ?? releaseMetadata.label,
                  disambiguation: album.disambiguation ?? releaseMetadata.disambiguation
                })
          }
        })
        .with({ kind: 'track' }, async (track) => {
          const [artistMetadata, recordingMetadata] = await Promise.all([
            track.artistName === undefined
              ? Promise.resolve(undefined)
              : this.getArtist(track.artistName),
            this.getRecording(track.answer, track.artistName, track.mbid)
          ])

          return {
            ...track,
            ...(artistMetadata === undefined ? {} : { artistMetadata }),
            ...(recordingMetadata === undefined
              ? {}
              : {
                  mbid: track.mbid ?? recordingMetadata.mbid,
                  releaseDate: track.releaseDate ?? recordingMetadata.releaseDate,
                  releaseType: track.releaseType ?? recordingMetadata.releaseType,
                  label: track.label ?? recordingMetadata.label,
                  disambiguation: track.disambiguation ?? recordingMetadata.disambiguation,
                  durationMs: track.durationMs ?? recordingMetadata.durationMs,
                  albumName: track.albumName ?? recordingMetadata.albumName
                })
          }
        })
        .exhaustive()
    } catch (error) {
      this.report(error)
      return candidate
    }
  }

  private async getArtist(name: string, mbid?: string): Promise<JumbleArtistMetadata | undefined> {
    const cacheKey = `musicbrainz:artist:${mbid ?? normalizeMusicBrainzKey(name)}`
    const cached = await this.readCache(cacheKey, JumbleArtistMetadataSchema)
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
    const cacheKey = `musicbrainz:release:${mbid ?? `${normalizeMusicBrainzKey(artistName ?? '')}:${normalizeMusicBrainzKey(name)}`}`
    const cached = await this.readCache(cacheKey, ReleaseMetadataSchema)
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
    const cacheKey = `musicbrainz:recording:${mbid ?? `${normalizeMusicBrainzKey(artistName ?? '')}:${normalizeMusicBrainzKey(name)}`}`
    const cached = await this.readCache(cacheKey, RecordingMetadataSchema)
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

  private async readCache<T>(
    cacheKey: string,
    valueSchema: ZodType<T>
  ): Promise<CachedMusicBrainzLookup<T> | null> {
    if (this.cache === undefined) return null
    const entry = await this.cache.get(cacheKey, musicBrainzCachedValueSchema(valueSchema))
    if (entry === null) return null

    return match(entry.value)
      .returnType<CachedMusicBrainzLookup<T>>()
      .with({ found: false }, () => ({ found: false, fresh: entry.fresh }))
      .with({ found: true }, ({ value }) => ({ found: true, fresh: entry.fresh, value }))
      .exhaustive()
  }

  private async writeCache<T>(
    cacheKey: string,
    value: CachedMusicBrainzValue<T>,
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
        return isMusicBrainzObject(payload) ? payload : null
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

function isMbid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
}

function escapeLucene(value: string): string {
  return value.replace(/[+\-!(){}[\]^"~*?:\\/]/gu, '\\$&')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
