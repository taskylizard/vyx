import { match, P } from 'ts-pattern'
import { normalizeAnswer } from './answer.ts'
import { getCandidateImageUrls, mergeJumbleCandidates } from './candidate.ts'
import {
  type JumbleMusicProvider,
  type LastFmClientOptions,
  type LastFmEnvelope
} from './lastfm-types.ts'
import {
  isLastFmObject,
  mergeLastFmArtistDetails,
  mergeLastFmDetails,
  normalizeLastFmUsername,
  parseLastFmString,
  parseLastFmTopItems
} from './lastfm-parser.ts'
import { clamp } from './numbers.ts'
import { readBoundedJson } from './response.ts'
import { emitJumbleTiming, jumbleDurationMs, type JumbleTimingSink } from './timing.ts'
import type {
  JumbleAlbumCandidate,
  JumbleArtistCandidate,
  JumbleArtistMetadata,
  JumbleCandidate,
  JumbleHint,
  JumbleKind,
  JumbleTrackCandidate
} from './types.ts'

export type { JumbleMusicProvider, LastFmClientOptions } from './lastfm-types.ts'

export class LastFmError extends Error {
  readonly code: string
  readonly status: number | undefined

  constructor(message: string, code = 'lastfm-error', status?: number) {
    super(message)
    this.name = 'LastFmError'
    this.code = code
    this.status = status
  }
}

export class MissingLastFmProvider implements JumbleMusicProvider {
  async getCandidates(): Promise<readonly JumbleCandidate[]> {
    throw new LastFmError('Jumble needs a LASTFM_API_KEY environment variable.', 'missing-api-key')
  }

  async getHints(): Promise<readonly JumbleHint[]> {
    throw new LastFmError('Jumble needs a LASTFM_API_KEY environment variable.', 'missing-api-key')
  }

  async validateUsername(): Promise<string> {
    throw new LastFmError('Jumble needs a LASTFM_API_KEY environment variable.', 'missing-api-key')
  }
}

/** A small Last.fm REST client tailored to the data Jumble needs. */
export class LastFmClient implements JumbleMusicProvider {
  private readonly options: LastFmClientOptions
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly cacheEntries: number
  private readonly cacheBytes: number
  private readonly maxResponseBytes: number
  private readonly onTiming?: JumbleTimingSink
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: LastFmEnvelope; bytes: number }
  >()
  private cacheSize = 0
  private readonly inflight = new Map<string, Promise<LastFmEnvelope>>()

  constructor(options: LastFmClientOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = options.baseUrl ?? 'https://ws.audioscrobbler.com/2.0/'
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.cacheEntries = clamp(Math.trunc(options.cacheEntries ?? 128), 1, 512)
    this.cacheBytes = clamp(
      Math.trunc(options.cacheBytes ?? 8 * 1024 * 1024),
      64 * 1024,
      64 * 1024 * 1024
    )
    this.maxResponseBytes = clamp(
      Math.trunc(options.maxResponseBytes ?? 1024 * 1024),
      16 * 1024,
      8 * 1024 * 1024
    )
    this.onTiming = options.onTiming
  }

  async getCandidates(
    kind: JumbleKind,
    username: string,
    limit = 100
  ): Promise<readonly JumbleCandidate[]> {
    const safeUsername = normalizeLastFmUsername(username)
    if (safeUsername.length === 0) {
      throw new LastFmError('Enter a Last.fm username first.', 'invalid-username')
    }
    const method = match(kind)
      .with('artist', () => 'user.gettopartists')
      .with('album', () => 'user.gettopalbums')
      .with('track', () => 'user.gettoptracks')
      .exhaustive()
    const payload = await this.request(method, {
      user: safeUsername,
      period: 'overall',
      limit: String(clamp(limit, 1, 200)),
      page: '1'
    })
    const candidates = parseLastFmTopItems(payload, kind)
    if (candidates.length === 0) {
      throw new LastFmError(
        `Last.fm did not return any ${kind} scrobbles for "${safeUsername}".`,
        'empty-results'
      )
    }
    return candidates
  }

  async getHints(candidate: JumbleCandidate): Promise<readonly JumbleHint[]> {
    return match(candidate)
      .returnType<readonly JumbleHint[]>()
      .with({ kind: 'artist' }, buildArtistHints)
      .with({ kind: 'album' }, buildReleaseHints)
      .with({ kind: 'track' }, buildReleaseHints)
      .exhaustive()
  }

  async validateUsername(username: string): Promise<string> {
    const normalized = normalizeLastFmUsername(username)
    const payload = await this.request('user.getinfo', { user: normalized })
    const user = payload.user
    if (!isLastFmObject(user))
      throw new LastFmError('Last.fm could not find that user.', 'invalid-username')
    return parseLastFmString(user.name) ?? normalized
  }

  /** Enriches one selected item without making the whole top-list request expensive. */
  async hydrate(candidate: JumbleCandidate): Promise<JumbleCandidate> {
    let hydrated = candidate
    const detailStartedAt = performance.now()
    let detailOutcome: 'success' | 'partial' | 'failed' = 'failed'
    try {
      const detail = match(candidate.kind)
        .with('artist', () => ({
          method: 'artist.getinfo',
          params: { artist: candidate.answer }
        }))
        .with('album', () => ({
          method: 'album.getinfo',
          params: { album: candidate.answer, artist: candidate.artistName ?? '' }
        }))
        .with('track', () => ({
          method: 'track.getinfo',
          params: { artist: candidate.artistName ?? '', track: candidate.answer }
        }))
        .exhaustive()
      const detailPromise = this.request(detail.method, detail.params)
      const artistPromise = match(candidate)
        .returnType<Promise<LastFmEnvelope | undefined>>()
        .with({ kind: 'artist' }, () => Promise.resolve(undefined))
        .with({ kind: P.union('album', 'track'), artistName: P.string }, ({ artistName }) =>
          this.request('artist.getinfo', { artist: artistName })
        )
        .with({ kind: P.union('album', 'track') }, () => Promise.resolve(undefined))
        .exhaustive()
      const [detailResult, artistResult] = await Promise.allSettled([detailPromise, artistPromise])
      const artistRequested = candidate.kind !== 'artist' && candidate.artistName !== undefined
      detailOutcome = match({
        detail: detailResult.status,
        artist: artistRequested ? artistResult.status : 'skipped'
      })
        .returnType<'success' | 'partial' | 'failed'>()
        .with({ detail: 'fulfilled', artist: P.union('fulfilled', 'skipped') }, () => 'success')
        .with({ detail: 'rejected', artist: P.union('rejected', 'skipped') }, () => 'failed')
        .otherwise(() => 'partial')
      hydrated = match(detailResult)
        .with({ status: 'fulfilled' }, ({ value }) => mergeLastFmDetails(candidate, value))
        .otherwise(() => hydrated)
      hydrated = match(artistResult)
        .with({ status: 'fulfilled', value: P.nonNullable }, ({ value }) =>
          mergeLastFmArtistDetails(hydrated, value)
        )
        .otherwise(() => hydrated)
    } catch {
      // tasky: top-list data is enough to play; detail calls only improve hints.
    } finally {
      emitJumbleTiming(this.onTiming, {
        type: 'provider',
        provider: 'lastfm',
        operation: 'details',
        kind: candidate.kind,
        outcome: detailOutcome,
        durationMs: jumbleDurationMs(detailStartedAt),
        imageCount: getCandidateImageUrls(hydrated).length
      })
    }
    const needsDiscogs =
      this.options.discogs !== undefined &&
      (getCandidateImageUrls(hydrated).length === 0 ||
        normalizeAnswer(hydrated.answer).length === 0 ||
        hasNonLatinLetters(hydrated.answer))
    const needsDeezer =
      this.options.deezer !== undefined && getCandidateImageUrls(hydrated).length === 0
    const musicBrainz = this.options.musicBrainz
    const discogs = this.options.discogs
    const deezer = this.options.deezer
    const [musicBrainzResult, discogsResult, deezerResult] = await Promise.allSettled([
      musicBrainz === undefined
        ? Promise.resolve(undefined)
        : this.measureEnrichment('musicbrainz', hydrated, () => musicBrainz.enrich(hydrated)),
      needsDiscogs && discogs !== undefined
        ? this.measureEnrichment('discogs', hydrated, () => discogs.enrich(hydrated))
        : Promise.resolve(undefined),
      needsDeezer && deezer !== undefined
        ? this.measureEnrichment('deezer', hydrated, () => deezer.enrich(hydrated))
        : Promise.resolve(undefined)
    ])
    const musicBrainzCandidate = match(musicBrainzResult)
      .with({ status: 'fulfilled' }, ({ value }) => value)
      .otherwise(() => undefined)
    const discogsCandidate = match(discogsResult)
      .with({ status: 'fulfilled' }, ({ value }) => value)
      .otherwise(() => undefined)
    const deezerCandidate = match(deezerResult)
      .with({ status: 'fulfilled' }, ({ value }) => value)
      .otherwise(() => undefined)
    hydrated = mergeJumbleCandidates(
      hydrated,
      deezerCandidate,
      musicBrainzCandidate,
      discogsCandidate
    )
    return hydrated
  }

  private async measureEnrichment(
    provider: 'musicbrainz' | 'discogs' | 'deezer',
    candidate: JumbleCandidate,
    task: () => Promise<JumbleCandidate>
  ): Promise<JumbleCandidate> {
    const startedAt = performance.now()
    try {
      const enriched = await task()
      emitJumbleTiming(this.onTiming, {
        type: 'provider',
        provider,
        operation: 'enrichment',
        kind: candidate.kind,
        outcome: enriched === candidate ? 'unchanged' : 'success',
        durationMs: jumbleDurationMs(startedAt),
        imageCount: getCandidateImageUrls(enriched).length
      })
      return enriched
    } catch (error) {
      emitJumbleTiming(this.onTiming, {
        type: 'provider',
        provider,
        operation: 'enrichment',
        kind: candidate.kind,
        outcome: 'failed',
        durationMs: jumbleDurationMs(startedAt),
        imageCount: getCandidateImageUrls(candidate).length
      })
      throw error
    }
  }

  private async request(method: string, params: Record<string, string>): Promise<LastFmEnvelope> {
    const query = new URLSearchParams({
      method,
      api_key: this.options.apiKey,
      format: 'json',
      ...params
    })
    const url = `${this.baseUrl}?${query.toString()}`
    const cached = this.cache.get(url)
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      this.cache.delete(url)
      this.cacheSize -= cached.bytes
      this.cache.set(url, cached)
      return cached.value
    }
    if (cached !== undefined) {
      this.cache.delete(url)
      this.cacheSize -= cached.bytes
    }

    const existing = this.inflight.get(url)
    if (existing !== undefined) return existing

    const task = this.fetchRequest(url)
    this.inflight.set(url, task)
    try {
      return await task
    } finally {
      this.inflight.delete(url)
    }
  }

  private async fetchRequest(url: string): Promise<LastFmEnvelope> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal })
      if (!response.ok) {
        throw new LastFmError(
          `Last.fm returned HTTP ${response.status}.`,
          'http-error',
          response.status
        )
      }
      const announcedLength = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(announcedLength) && announcedLength > this.maxResponseBytes) {
        throw new LastFmError('Last.fm response was too large.', 'response-too-large')
      }
      const payload: unknown = await readBoundedJson(response, this.maxResponseBytes)
      if (!isLastFmObject(payload))
        throw new LastFmError('Last.fm returned an invalid response.', 'invalid-response')
      if (payload.error !== undefined) {
        throw new LastFmError(
          payload.message ?? 'Last.fm rejected the request.',
          payload.error === 6 ? 'invalid-username' : String(payload.error)
        )
      }
      const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
      const previous = this.cache.get(url)
      if (previous !== undefined) this.cacheSize -= previous.bytes
      this.cache.set(url, { expiresAt: Date.now() + 5 * 60_000, value: payload, bytes })
      this.cacheSize += bytes
      while (this.cache.size > this.cacheEntries || this.cacheSize > this.cacheBytes) {
        const oldest = this.cache.keys().next().value
        if (oldest === undefined) break
        const entry = this.cache.get(oldest)
        this.cache.delete(oldest)
        this.cacheSize -= entry?.bytes ?? 0
      }
      return payload
    } catch (error) {
      throw match(error)
        .with(P.instanceOf(LastFmError), (value) => value)
        .when(
          (value): value is Error =>
            value instanceof Error && value.message.includes('safety limit'),
          () => new LastFmError('Last.fm response was too large.', 'response-too-large')
        )
        .when(
          (value): value is DOMException =>
            value instanceof DOMException && value.name === 'AbortError',
          () => new LastFmError('Last.fm took too long to respond.', 'timeout')
        )
        .otherwise(() => new LastFmError('Last.fm could not be reached.', 'network-error'))
    } finally {
      clearTimeout(timer)
    }
  }
}

function buildArtistHints(candidate: JumbleArtistCandidate): JumbleHint[] {
  const hints: JumbleHint[] = []
  if (candidate.playcount !== undefined) {
    addHint(
      hints,
      'playcount',
      `You have scrobbled this artist ${formatNumber(candidate.playcount)} times.`
    )
  }
  if (candidate.listeners !== undefined) {
    addHint(
      hints,
      'listeners',
      `Last.fm lists **${formatNumber(candidate.listeners)}** listeners for this artist.`
    )
  }
  addTagHint(hints, candidate.tags, 'artist')
  addTriviaHint(hints, candidate.summary, candidate.answer)
  addArtistMetadataHints(hints, candidate, candidate.answer, 'artist')
  return hints
}

function buildReleaseHints(candidate: JumbleAlbumCandidate | JumbleTrackCandidate): JumbleHint[] {
  const hints: JumbleHint[] = []
  addHint(
    hints,
    'type',
    match(candidate)
      .with(
        { kind: 'album' },
        (album) =>
          `This is ${articleFor(album.releaseType ?? 'album')} **${escapeHintValue(album.releaseType ?? 'album')}**.`
      )
      .with({ kind: 'track' }, () => 'This is a track.')
      .exhaustive()
  )
  if (candidate.playcount !== undefined) {
    addHint(
      hints,
      'playcount',
      `You have scrobbled this ${candidate.kind} ${formatNumber(candidate.playcount)} times.`
    )
  }
  if (candidate.listeners !== undefined) {
    addHint(
      hints,
      'listeners',
      `Last.fm lists **${formatNumber(candidate.listeners)}** listeners for this ${candidate.kind}.`
    )
  }
  if (candidate.releaseDate !== undefined) {
    addHint(hints, 'release-date', `Release date: **${escapeHintValue(candidate.releaseDate)}**.`)
  }
  match(candidate)
    .with({ kind: 'album' }, (album) => {
      if (album.releaseType !== undefined) {
        addHint(
          hints,
          'release-type',
          `The release type is **${escapeHintValue(album.releaseType)}**.`
        )
      }
    })
    .with({ kind: 'track' }, (track) => {
      if (track.albumName !== undefined) {
        addHint(hints, 'album', `This track appears on **${escapeHintValue(track.albumName)}**.`)
      }
    })
    .exhaustive()
  if (candidate.label !== undefined) {
    addHint(hints, 'label', `The label is **${escapeHintValue(candidate.label)}**.`)
  }
  addTagHint(hints, candidate.tags, 'release')
  addTriviaHint(hints, candidate.summary, candidate.answer, candidate.artistName)
  if (candidate.durationMs !== undefined) {
    addHint(hints, 'duration', `Its duration is **${formatDuration(candidate.durationMs)}**.`)
  }
  addArtistMetadataHints(hints, candidate.artistMetadata, candidate.artistName, 'artist')
  return hints
}

function addHint(hints: JumbleHint[], kind: string, content: string | undefined): void {
  if (content === undefined || content.trim().length === 0) return
  if (hints.some((hint) => hint.kind === kind || hint.content === content)) return
  hints.push({ kind, content })
}

function addTagHint(
  hints: JumbleHint[],
  tags: readonly string[] | undefined,
  subject: string
): void {
  const tag = tags?.find((value) => value.trim().length > 0)
  if (tag !== undefined) {
    addHint(hints, 'genre', `One of the ${subject}'s tags is **${escapeHintValue(tag)}**.`)
  }
}

function addTriviaHint(
  hints: JumbleHint[],
  summary: string | undefined,
  ...answerValues: Array<string | undefined>
): void {
  const cleaned = cleanTrivia(summary)
  if (cleaned === undefined) return
  const normalized = normalizeAnswer(cleaned)
  if (
    answerValues.some((value) => value !== undefined && normalized.includes(normalizeAnswer(value)))
  )
    return
  addHint(hints, 'trivia', `*${escapeHintValue(cleaned)}*`)
}

function addArtistMetadataHints(
  hints: JumbleHint[],
  metadata: JumbleArtistMetadata | JumbleCandidate | undefined,
  answer: string | undefined,
  subject: string
): void {
  if (metadata === undefined) return
  let type: string | undefined
  let countryCode: string | undefined
  let startDate: string | undefined
  let endDate: string | undefined
  let disambiguation: string | undefined
  let tags: readonly string[] | undefined
  let summary: string | undefined
  if ('kind' in metadata) {
    type = metadata.entityType ?? metadata.artistMetadata?.type
    countryCode = metadata.countryCode ?? metadata.artistMetadata?.countryCode
    startDate = metadata.startDate ?? metadata.artistMetadata?.startDate
    endDate = metadata.endDate ?? metadata.artistMetadata?.endDate
    disambiguation = metadata.disambiguation ?? metadata.artistMetadata?.disambiguation
    tags = metadata.tags ?? metadata.artistMetadata?.tags
    summary = metadata.summary ?? metadata.artistMetadata?.summary
  } else {
    type = metadata.type
    countryCode = metadata.countryCode
    startDate = metadata.startDate
    endDate = metadata.endDate
    disambiguation = metadata.disambiguation
    tags = metadata.tags
    summary = metadata.summary
  }

  addHint(hints, 'artist-type', artistTypeText(type, subject))
  addTagHint(hints, tags, 'artist')
  if (startDate !== undefined)
    addHint(hints, 'artist-start', `The artist started on **${escapeHintValue(startDate)}**.`)
  if (endDate !== undefined)
    addHint(hints, 'artist-end', `The artist ended on **${escapeHintValue(endDate)}**.`)
  if (countryCode !== undefined) {
    const flag = countryFlag(countryCode)
    if (flag !== undefined)
      addHint(hints, 'artist-country', `The artist's country flag is ${flag}.`)
  }
  if (disambiguation !== undefined) addTriviaHint(hints, disambiguation, answer)
  if (subject !== 'artist') addTriviaHint(hints, summary, answer)
}

function artistTypeText(type: string | undefined, subject = 'artist'): string {
  if (type === undefined)
    return subject === 'artist' ? 'This is an artist.' : 'The artist has been identified.'
  const normalized = type.toLowerCase()
  const label =
    normalized === 'person'
      ? 'person'
      : normalized === 'group'
        ? 'group'
        : normalized === 'orchestra'
          ? 'orchestra'
          : normalized === 'choir'
            ? 'choir'
            : normalized === 'character'
              ? 'character'
              : normalized
  return subject === 'artist'
    ? `This artist is a **${escapeHintValue(label)}**.`
    : `The artist is a **${escapeHintValue(label)}**.`
}

function articleFor(value: string): string {
  return /^[aeiou]/iu.test(value) ? 'an' : 'a'
}

function formatNumber(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString('en-US')
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function escapeHintValue(value: string): string {
  return value.replace(/[\\`*_~|>]/gu, '\\$&').replace(/@/gu, '@\u200b')
}

function cleanTrivia(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const plain = value
    .replace(/<a\b[^>]*>.*?<\/a>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/\s+/gu, ' ')
    .trim()
  if (plain.length < 24) return undefined
  const clipped = plain.length > 280 ? `${plain.slice(0, 277).replace(/\s+\S*$/u, '')}…` : plain
  return clipped.length < 24 ? undefined : clipped
}

function countryFlag(value: string): string | undefined {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z]{2}$/u.test(code)) return undefined
  return String.fromCodePoint(...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
}

function hasNonLatinLetters(value: string): boolean {
  return Array.from(value).some(
    (character) => /\p{Letter}/u.test(character) && !/\p{Script=Latin}/u.test(character)
  )
}
