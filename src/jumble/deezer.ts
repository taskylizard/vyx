import { match } from 'ts-pattern'
import { mergeImageUrlLists, mergeJumbleCandidates } from './candidate.ts'
import { parseDeezerSearch } from './deezer-parser.ts'
import {
  DeezerCachedValueSchema,
  type DeezerCachedValue,
  type DeezerClientOptions,
  type DeezerEnrichment,
  type DeezerRequestResult
} from './deezer-types.ts'
import type { JumbleMetadataCache } from './metadata-cache.ts'
import { clamp } from './numbers.ts'
import { readBoundedJson } from './response.ts'
import type { JumbleCandidate } from './types.ts'

const DEFAULT_BASE_URL = 'https://api.deezer.com'
const ENRICHMENT_TTL_MS = 30 * 24 * 60 * 60 * 1_000
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1_000

export type { DeezerClientOptions } from './deezer-types.ts'

/** Bounded, credential-free Deezer artwork enrichment for one selected item. */
export class DeezerClient {
  private readonly cache?: Pick<JumbleMetadataCache, 'get' | 'set'>
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxPending: number
  private readonly maxResponseBytes: number
  private readonly onError?: (error: unknown) => void
  private readonly inflight = new Map<string, Promise<DeezerRequestResult>>()
  private pending = 0

  constructor(options: DeezerClientOptions = {}) {
    this.cache = options.cache
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    this.timeoutMs = clamp(Math.trunc(options.timeoutMs ?? 5_000), 500, 30_000)
    this.maxPending = clamp(Math.trunc(options.maxPending ?? 32), 1, 64)
    this.maxResponseBytes = clamp(
      Math.trunc(options.maxResponseBytes ?? 512 * 1_024),
      16 * 1_024,
      4 * 1_024 * 1_024
    )
    this.onError = options.onError
  }

  async enrich(candidate: JumbleCandidate): Promise<JumbleCandidate> {
    const cacheKey = [
      'deezer:v1',
      candidate.kind,
      deezerCacheKeyPart(candidate.artistName ?? ''),
      deezerCacheKeyPart(candidate.albumName ?? ''),
      deezerCacheKeyPart(candidate.answer)
    ].join(':')
    const cached = await this.readCache(cacheKey)
    if (cached?.fresh) {
      return cached.value === undefined ? candidate : applyDeezerEnrichment(candidate, cached.value)
    }

    const response = await this.request(candidate)
    if (response.status === 'unavailable') {
      return cached?.value === undefined
        ? candidate
        : applyDeezerEnrichment(candidate, cached.value)
    }

    const parsed = parseDeezerSearch(response.payload, candidate)
    return match(parsed)
      .returnType<Promise<JumbleCandidate>>()
      .with({ status: 'found' }, async ({ value }) => {
        await this.writeCache(cacheKey, value, ENRICHMENT_TTL_MS)
        return applyDeezerEnrichment(candidate, value)
      })
      .with({ status: 'not-found' }, async () => {
        await this.writeCache(cacheKey, undefined, NEGATIVE_TTL_MS)
        return candidate
      })
      .with({ status: 'invalid' }, async () => candidate)
      .exhaustive()
  }

  private async readCache(
    cacheKey: string
  ): Promise<{ value: DeezerEnrichment | undefined; fresh: boolean } | null> {
    if (this.cache === undefined) return null
    const entry = await this.cache.get(cacheKey, DeezerCachedValueSchema)
    if (entry === null) return null
    return match(entry.value)
      .with({ found: false }, () => ({ value: undefined, fresh: entry.fresh }))
      .with({ found: true }, ({ value }) => ({ value, fresh: entry.fresh }))
      .exhaustive()
  }

  private async writeCache(
    cacheKey: string,
    value: DeezerEnrichment | undefined,
    ttlMs: number
  ): Promise<void> {
    if (this.cache === undefined) return
    const cached: DeezerCachedValue =
      value === undefined ? { found: false } : { found: true, value }
    await this.cache.set(cacheKey, cached, ttlMs)
  }

  private async request(candidate: JumbleCandidate): Promise<DeezerRequestResult> {
    const endpoint = match(candidate.kind)
      .with('artist', () => '/search/artist')
      .with('album', () => '/search/album')
      .with('track', () => '/search/track')
      .exhaustive()
    const terms = [candidate.answer, candidate.artistName]
      .filter((value): value is string => value !== undefined && value.trim().length > 0)
      .join(' ')
    const query = new URLSearchParams({ q: terms, limit: '10' })
    const url = `${this.baseUrl}${endpoint}?${query.toString()}`
    const existing = this.inflight.get(url)
    if (existing !== undefined) return existing
    if (this.pending >= this.maxPending) return { status: 'unavailable' }

    this.pending += 1
    const task = this.fetchRequest(url)
    this.inflight.set(url, task)
    try {
      return await task
    } finally {
      this.pending -= 1
      this.inflight.delete(url)
    }
  }

  private async fetchRequest(url: string): Promise<DeezerRequestResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal
      })
      if (!response.ok) return { status: 'unavailable' }
      const length = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(length) && length > this.maxResponseBytes) {
        return { status: 'unavailable' }
      }
      return { status: 'ok', payload: await readBoundedJson(response, this.maxResponseBytes) }
    } catch (error) {
      this.onError?.(error)
      return { status: 'unavailable' }
    } finally {
      clearTimeout(timer)
    }
  }
}

function applyDeezerEnrichment(
  candidate: JumbleCandidate,
  enrichment: DeezerEnrichment
): JumbleCandidate {
  return match(candidate)
    .returnType<JumbleCandidate>()
    .with({ kind: 'artist' }, (artist) =>
      mergeJumbleCandidates(artist, {
        ...artist,
        imageUrls: mergeImageUrlLists(artist.imageUrls, enrichment.imageUrls),
        sourceUrl: artist.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .with({ kind: 'album' }, (album) =>
      mergeJumbleCandidates(album, {
        ...album,
        imageUrls: mergeImageUrlLists(album.imageUrls, enrichment.imageUrls),
        releaseDate: album.releaseDate ?? enrichment.releaseDate,
        releaseType: album.releaseType ?? enrichment.releaseType,
        sourceUrl: album.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .with({ kind: 'track' }, (track) =>
      mergeJumbleCandidates(track, {
        ...track,
        imageUrls: mergeImageUrlLists(track.imageUrls, enrichment.imageUrls),
        albumName: track.albumName ?? enrichment.albumName,
        durationMs: track.durationMs ?? enrichment.durationMs,
        sourceUrl: track.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .exhaustive()
}

function deezerCacheKeyPart(value: string): string {
  const normalized = normalizeCacheKey(value)
  return encodeURIComponent(normalized).slice(0, 160)
}

function normalizeCacheKey(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}
