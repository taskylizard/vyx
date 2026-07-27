import { match } from 'ts-pattern'
import { normalizeAnswer, removeEditionSuffix } from './answer.ts'
import { createAnswerVariants, mergeImageUrlLists, mergeJumbleCandidates } from './candidate.ts'
import { clamp } from './numbers.ts'
import {
  discogsTitleVariants,
  parseDiscogsArtist,
  parseDiscogsRelease,
  parseDiscogsSearch
} from './discogs-parser.ts'
import {
  DiscogsCachedValueSchema,
  type DiscogsCachedValue,
  type DiscogsClientOptions,
  type DiscogsEnrichment,
  type DiscogsEnvelope,
  type DiscogsReleaseLookup,
  type DiscogsReleaseSearchResult,
  type DiscogsSearchResult
} from './discogs-types.ts'
import type {
  JumbleAlbumCandidate,
  JumbleArtistCandidate,
  JumbleCandidate,
  JumbleTrackCandidate
} from './types.ts'
import { readBoundedJson } from './response.ts'

const DEFAULT_BASE_URL = 'https://api.discogs.com'
const DEFAULT_USER_AGENT = 'Kanikou/0.0.0 (https://github.com/taskylizard/kanikou)'
const ENRICHMENT_TTL_MS = 90 * 24 * 60 * 60 * 1_000
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1_000

export type { DiscogsClientOptions } from './discogs-types.ts'

/**
 * Bounded, read-only Discogs enrichment for the selected Jumble candidate.
 * Discogs is never queried for the complete Last.fm list.
 */
export class DiscogsClient {
  private readonly token?: string
  private readonly cache?: DiscogsClientOptions['cache']
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly minIntervalMs: number
  private readonly maxPending: number
  private readonly maxResponseBytes: number
  private readonly now: () => number
  private readonly onError?: (error: unknown) => void
  private readonly inflight = new Map<string, Promise<DiscogsEnvelope | null>>()
  private queueTail: Promise<void> = Promise.resolve()
  private nextRequestAt = 0
  private pending = 0

  constructor(options: DiscogsClientOptions = {}) {
    this.token = options.token?.trim() || undefined
    this.cache = options.cache
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.timeoutMs = clamp(Math.trunc(options.timeoutMs ?? 8_000), 500, 60_000)
    this.minIntervalMs = Math.max(
      0,
      Math.trunc(options.minIntervalMs ?? (this.token === undefined ? 2_500 : 1_000))
    )
    this.maxPending = clamp(Math.trunc(options.maxPending ?? 8), 1, 32)
    this.maxResponseBytes = clamp(
      Math.trunc(options.maxResponseBytes ?? 1_024 * 1_024),
      16 * 1024,
      8 * 1024 * 1024
    )
    this.now = options.now ?? Date.now
    this.onError = options.onError
  }

  async enrich(candidate: JumbleCandidate): Promise<JumbleCandidate> {
    try {
      return await match(candidate)
        .returnType<Promise<JumbleCandidate>>()
        .with({ kind: 'artist' }, (artist) => this.enrichArtist(artist))
        .with({ kind: 'album' }, (album) => this.enrichRelease(album))
        .with({ kind: 'track' }, (track) => this.enrichRelease(track))
        .exhaustive()
    } catch (error) {
      this.report(error)
      return candidate
    }
  }

  private async enrichArtist(candidate: JumbleArtistCandidate): Promise<JumbleCandidate> {
    const cacheKey = `discogs:artist:${discogsCacheKeyPart(candidate.answer)}`
    const cached = await this.readCache(cacheKey)
    if (cached?.fresh)
      return cached.value === undefined ? candidate : applyEnrichment(candidate, cached.value)

    const search = await this.request('/database/search', {
      type: 'artist',
      q: candidate.answer,
      per_page: '5'
    })
    if (search === null)
      return cached?.value === undefined ? candidate : applyEnrichment(candidate, cached.value)
    const result = chooseArtistResult(parseDiscogsSearch(search), candidate.answer)
    if (result === undefined) {
      await this.writeCache(cacheKey, undefined, NEGATIVE_TTL_MS)
      return candidate
    }

    const detail = await this.request(`/artists/${result.id}`)
    if (detail === null) {
      const fallback = cached?.value ?? fallbackSearchEnrichment(result, 'artist')
      return applyEnrichment(candidate, fallback)
    }
    const enrichment = parseDiscogsArtist(detail) ?? fallbackSearchEnrichment(result, 'artist')
    await this.writeCache(cacheKey, enrichment, ENRICHMENT_TTL_MS)
    return applyEnrichment(candidate, enrichment)
  }

  private async enrichRelease(
    candidate: JumbleAlbumCandidate | JumbleTrackCandidate
  ): Promise<JumbleCandidate> {
    const cacheKey = [
      'discogs',
      candidate.kind,
      discogsCacheKeyPart(candidate.artistName ?? ''),
      discogsCacheKeyPart(candidate.albumName ?? candidate.answer),
      discogsCacheKeyPart(candidate.answer)
    ].join(':')
    const cached = await this.readCache(cacheKey)
    if (cached?.fresh)
      return cached.value === undefined ? candidate : applyEnrichment(candidate, cached.value)

    return match(await this.findRelease(candidate))
      .returnType<Promise<JumbleCandidate>>()
      .with({ status: 'unavailable' }, async () =>
        cached?.value === undefined ? candidate : applyEnrichment(candidate, cached.value)
      )
      .with({ status: 'not-found' }, async () => {
        await this.writeCache(cacheKey, undefined, NEGATIVE_TTL_MS)
        return candidate
      })
      .with({ status: 'found' }, async ({ result }) => {
        const endpoint = match(result.type)
          .with('master', () => `/masters/${result.id}`)
          .with('release', () => `/releases/${result.id}`)
          .exhaustive()
        const detail = await this.request(endpoint)
        if (detail === null) {
          const fallback = cached?.value ?? fallbackSearchEnrichment(result, 'release')
          return applyEnrichment(candidate, fallback)
        }
        const parsed = parseDiscogsRelease(detail, candidate)
        const enrichment = {
          ...(parsed ?? fallbackSearchEnrichment(result, 'release')),
          sourceUrl: discogsSourceUrl(result)
        }
        await this.writeCache(cacheKey, enrichment, ENRICHMENT_TTL_MS)
        return applyEnrichment(candidate, enrichment)
      })
      .exhaustive()
  }

  private async findRelease(
    candidate: JumbleAlbumCandidate | JumbleTrackCandidate
  ): Promise<DiscogsReleaseLookup> {
    const terms = [candidate.albumName, candidate.answer]
      .map((value) => value?.trim())
      .filter((value): value is string => value !== undefined && value.length > 0)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 2)
    let unavailable = false
    for (const term of terms) {
      // eslint-disable-next-line no-await-in-loop -- tasky: sequential search, tries query terms in priority order, returning the first match
      const search = await this.request('/database/search', {
        type: 'release',
        q: term,
        ...(candidate.artistName === undefined ? {} : { artist: candidate.artistName }),
        per_page: '5'
      })
      if (search === null) {
        unavailable = true
        continue
      }
      const result = chooseReleaseResult(parseDiscogsSearch(search), candidate, term)
      if (result !== undefined) return { status: 'found', result }
    }
    return unavailable ? { status: 'unavailable' } : { status: 'not-found' }
  }

  private async readCache(
    cacheKey: string
  ): Promise<{ value: DiscogsEnrichment | undefined; fresh: boolean } | null> {
    if (this.cache === undefined) return null
    const entry = await this.cache.get(cacheKey, DiscogsCachedValueSchema)
    if (entry === null) return null
    return match(entry.value)
      .with({ found: false }, () => ({ value: undefined, fresh: entry.fresh }))
      .with({ found: true }, ({ value }) => ({ value, fresh: entry.fresh }))
      .exhaustive()
  }

  private async writeCache(
    cacheKey: string,
    value: DiscogsEnrichment | undefined,
    ttlMs: number
  ): Promise<void> {
    if (this.cache === undefined) return
    const cached: DiscogsCachedValue =
      value === undefined ? { found: false } : { found: true, value }
    await this.cache.set(cacheKey, cached, ttlMs)
  }

  private async request(
    path: string,
    params: Record<string, string> = {}
  ): Promise<DiscogsEnvelope | null> {
    const query = new URLSearchParams(params)
    const url = `${this.baseUrl}${path}${query.size === 0 ? '' : `?${query.toString()}`}`
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

  private async enqueue(url: string): Promise<DiscogsEnvelope | null> {
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
            'user-agent': this.userAgent,
            ...(this.token === undefined ? {} : { authorization: `Discogs token=${this.token}` })
          },
          signal: controller.signal
        })
        if (!response.ok) return null
        const length = Number(response.headers.get('content-length') ?? 0)
        if (Number.isFinite(length) && length > this.maxResponseBytes) return null
        const payload: unknown = await readBoundedJson(response, this.maxResponseBytes)
        return isDiscogsObject(payload) ? payload : null
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

function applyEnrichment(
  candidate: JumbleCandidate,
  enrichment: DiscogsEnrichment
): JumbleCandidate {
  return match(candidate)
    .returnType<JumbleCandidate>()
    .with({ kind: 'artist' }, (artist) =>
      mergeJumbleCandidates(artist, {
        ...artist,
        imageUrls: mergeImageUrlLists(artist.imageUrls, enrichment.imageUrls),
        answerVariants: enrichment.answerVariants,
        summary: artist.summary ?? enrichment.summary,
        sourceUrl: artist.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .with({ kind: 'album' }, (album) =>
      mergeJumbleCandidates(album, {
        ...album,
        imageUrls: mergeImageUrlLists(album.imageUrls, enrichment.imageUrls),
        answerVariants: enrichment.answerVariants,
        releaseDate: album.releaseDate ?? enrichment.releaseDate,
        releaseType: album.releaseType ?? enrichment.releaseType,
        label: album.label ?? enrichment.label,
        tags: enrichment.tags,
        summary: album.summary ?? enrichment.summary,
        sourceUrl: album.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .with({ kind: 'track' }, (track) =>
      mergeJumbleCandidates(track, {
        ...track,
        imageUrls: mergeImageUrlLists(track.imageUrls, enrichment.imageUrls),
        answerVariants: enrichment.answerVariants,
        releaseDate: track.releaseDate ?? enrichment.releaseDate,
        releaseType: track.releaseType ?? enrichment.releaseType,
        label: track.label ?? enrichment.label,
        tags: enrichment.tags,
        summary: track.summary ?? enrichment.summary,
        sourceUrl: track.sourceUrl ?? enrichment.sourceUrl
      })
    )
    .exhaustive()
}

function chooseArtistResult(
  results: readonly DiscogsSearchResult[],
  answer: string
): DiscogsSearchResult | undefined {
  const expected = normalizeAnswer(answer)
  return results.find(
    (result) => normalizeAnswer(stripDiscogsSuffix(result.title ?? '')) === expected
  )
}

function chooseReleaseResult(
  results: readonly DiscogsSearchResult[],
  candidate: JumbleAlbumCandidate | JumbleTrackCandidate,
  term: string
): DiscogsReleaseSearchResult | undefined {
  const expected = normalizeAnswer(term)
  const answer = normalizeAnswer(candidate.answer)
  const album = normalizeAnswer(candidate.albumName ?? '')
  return results
    .filter(isDiscogsReleaseSearchResult)
    .map((result) => ({
      result,
      score: releaseScore(result, expected, answer, album, candidate.artistName)
    }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score)[0]?.result
}

function releaseScore(
  result: DiscogsReleaseSearchResult,
  expected: string,
  answer: string,
  album: string,
  artistName?: string
): number {
  const resultArtist = discogsArtistFromSearchTitle(result.title ?? '')
  if (
    artistName !== undefined &&
    resultArtist !== undefined &&
    normalizeAnswer(resultArtist) !== normalizeAnswer(artistName)
  )
    return 0

  const title = normalizeAnswer(
    removeEditionSuffix(discogsReleaseFromSearchTitle(result.title ?? ''))
  )
  if (expected.length > 0 && title === expected) return 6
  if (album.length > 0 && title === album) return 5
  if (answer.length > 0 && title === answer) return 3
  return 0
}

function isDiscogsReleaseSearchResult(
  result: DiscogsSearchResult
): result is DiscogsReleaseSearchResult {
  return match(result.type)
    .with('release', 'master', () => true)
    .with('artist', () => false)
    .exhaustive()
}

function fallbackSearchEnrichment(
  result: DiscogsSearchResult,
  kind: 'artist' | 'release'
): DiscogsEnrichment {
  const separator = result.title?.indexOf(' - ') ?? -1
  const rawTitle = match(kind)
    .returnType<string | undefined>()
    .with('artist', () =>
      result.title === undefined ? undefined : stripDiscogsSuffix(result.title)
    )
    .with('release', () =>
      result.title === undefined ? undefined : result.title.slice(separator < 0 ? 0 : separator + 3)
    )
    .exhaustive()
  const title = rawTitle === undefined ? [] : discogsTitleVariants(rawTitle)
  return {
    answerVariants: title.length === 0 ? undefined : createAnswerVariants(title, 'discogs'),
    imageUrls: result.coverImage === undefined ? undefined : [result.coverImage],
    sourceUrl: discogsSourceUrl(result),
    releaseDate: match(kind)
      .returnType<string | undefined>()
      .with('artist', () => undefined)
      .with('release', () => result.year)
      .exhaustive()
  }
}

function discogsSourceUrl(result: DiscogsSearchResult): string {
  const sourceType = match(result.type)
    .with('artist', () => 'artist')
    .with('master', () => 'master')
    .with('release', () => 'release')
    .exhaustive()
  return `https://www.discogs.com/${sourceType}/${result.id}`
}

function discogsArtistFromSearchTitle(value: string): string | undefined {
  const separator = value.indexOf(' - ')
  return separator < 0 ? undefined : stripDiscogsSuffix(value.slice(0, separator).trim())
}

function discogsReleaseFromSearchTitle(value: string): string {
  const separator = value.indexOf(' - ')
  return separator < 0 ? value : value.slice(separator + 3).trim()
}

function discogsCacheKeyPart(value: string): string {
  const trimmed = value.trim().slice(0, 128)
  const normalized = normalizeAnswer(trimmed)
  return normalized.length > 0
    ? `normalized-${normalized}`
    : `raw-${encodeURIComponent(trimmed.toLocaleLowerCase())}`
}

function stripDiscogsSuffix(value: string): string {
  return value.replace(/\s+\(\d+\)$/u, '')
}

function isDiscogsObject(value: unknown): value is DiscogsEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
