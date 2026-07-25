import { normalizeAnswer } from './answer.ts'
import { readBoundedJson } from './response.ts'
import type { JumbleArtistMetadata, JumbleCandidate, JumbleHint, JumbleKind } from './types.ts'
import type { MusicBrainzClient } from './musicbrainz.ts'

export interface LastFmClientOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  cacheEntries?: number
  cacheBytes?: number
  maxResponseBytes?: number
  musicBrainz?: Pick<MusicBrainzClient, 'enrich'>
}

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

export interface JumbleMusicProvider {
  getCandidates(
    kind: JumbleKind,
    username: string,
    limit?: number
  ): Promise<readonly JumbleCandidate[]>
  getHints(candidate: JumbleCandidate): Promise<readonly JumbleHint[]>
  validateUsername?(username: string): Promise<string>
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

interface LastFmEnvelope {
  error?: number
  message?: string
  [key: string]: unknown
}

interface LastFmImage {
  '#text'?: unknown
  size?: unknown
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
  private readonly cache = new Map<string, { expiresAt: number; value: unknown; bytes: number }>()
  private cacheSize = 0
  private readonly inflight = new Map<string, Promise<LastFmEnvelope>>()

  constructor(options: LastFmClientOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = options.baseUrl ?? 'https://ws.audioscrobbler.com/2.0/'
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.cacheEntries = Math.min(Math.max(Math.trunc(options.cacheEntries ?? 128), 1), 512)
    this.cacheBytes = Math.min(
      Math.max(Math.trunc(options.cacheBytes ?? 8 * 1024 * 1024), 64 * 1024),
      64 * 1024 * 1024
    )
    this.maxResponseBytes = Math.min(
      Math.max(Math.trunc(options.maxResponseBytes ?? 1 * 1024 * 1024), 16 * 1024),
      8 * 1024 * 1024
    )
  }

  async getCandidates(
    kind: JumbleKind,
    username: string,
    limit = 100
  ): Promise<readonly JumbleCandidate[]> {
    const safeUsername = normalizeUsername(username)
    if (safeUsername.length === 0) {
      throw new LastFmError('Enter a Last.fm username first.', 'invalid-username')
    }
    const method =
      kind === 'artist'
        ? 'user.gettopartists'
        : kind === 'album'
          ? 'user.gettopalbums'
          : 'user.gettoptracks'
    const payload = await this.request(method, {
      user: safeUsername,
      period: 'overall',
      limit: String(Math.min(Math.max(limit, 1), 200)),
      page: '1'
    })
    const candidates = parseTopItems(payload, kind)
    if (candidates.length === 0) {
      throw new LastFmError(
        `Last.fm did not return any ${kind} scrobbles for "${safeUsername}".`,
        'empty-results'
      )
    }
    return candidates
  }

  async getHints(candidate: JumbleCandidate): Promise<readonly JumbleHint[]> {
    const hints: JumbleHint[] = []
    if (candidate.kind === 'artist') {
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

    addHint(
      hints,
      'type',
      candidate.kind === 'album'
        ? `This is ${articleFor(candidate.releaseType ?? 'album')} **${escapeHintValue(candidate.releaseType ?? 'album')}**.`
        : 'This is a track.'
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
    if (candidate.releaseType !== undefined && candidate.kind === 'album') {
      addHint(
        hints,
        'release-type',
        `The release type is **${escapeHintValue(candidate.releaseType)}**.`
      )
    }
    if (candidate.label !== undefined) {
      addHint(hints, 'label', `The label is **${escapeHintValue(candidate.label)}**.`)
    }
    addTagHint(hints, candidate.tags, 'release')
    addTriviaHint(hints, candidate.summary, candidate.answer, candidate.artistName)
    if (candidate.kind === 'track' && candidate.albumName !== undefined) {
      addHint(hints, 'album', `This track appears on **${escapeHintValue(candidate.albumName)}**.`)
    }
    if (candidate.durationMs !== undefined) {
      addHint(hints, 'duration', `Its duration is **${formatDuration(candidate.durationMs)}**.`)
    }
    addArtistMetadataHints(hints, candidate.artistMetadata, candidate.artistName, 'artist')
    return hints
  }

  async validateUsername(username: string): Promise<string> {
    const normalized = normalizeUsername(username)
    const payload = await this.request('user.getinfo', { user: normalized })
    const user = payload.user
    if (!isRecord(user))
      throw new LastFmError('Last.fm could not find that user.', 'invalid-username')
    return stringValue(user.name) ?? normalized
  }

  /** Enriches one selected item without making the whole top-list request expensive. */
  async hydrate(candidate: JumbleCandidate): Promise<JumbleCandidate> {
    let hydrated = candidate
    try {
      const method =
        candidate.kind === 'artist'
          ? 'artist.getinfo'
          : candidate.kind === 'album'
            ? 'album.getinfo'
            : 'track.getinfo'
      const params =
        candidate.kind === 'artist'
          ? { artist: candidate.answer }
          : {
              artist: candidate.artistName ?? '',
              ...(candidate.kind === 'album'
                ? { album: candidate.answer }
                : { track: candidate.answer })
            }
      const detailPromise = this.request(method, params)
      const artistPromise =
        candidate.kind === 'artist' || candidate.artistName === undefined
          ? Promise.resolve(undefined)
          : this.request('artist.getinfo', { artist: candidate.artistName })
      const [detailResult, artistResult] = await Promise.allSettled([detailPromise, artistPromise])
      if (detailResult.status === 'fulfilled') {
        hydrated = mergeDetails(candidate, detailResult.value, candidate.kind)
      }
      if (artistResult.status === 'fulfilled' && artistResult.value !== undefined) {
        hydrated = mergeArtistDetails(hydrated, artistResult.value)
      }
    } catch {
      // Top-list data is sufficient to play; detail endpoints are best-effort hints.
    }
    if (this.options.musicBrainz !== undefined) {
      try {
        hydrated = await this.options.musicBrainz.enrich(hydrated)
      } catch {
        // MusicBrainz is an optional hint source; never make a game fail for it.
      }
    }
    return hydrated
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
      return cached.value as LastFmEnvelope
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
      if (!isEnvelope(payload))
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
      if (error instanceof LastFmError) throw error
      if (error instanceof Error && error.message.includes('safety limit')) {
        throw new LastFmError('Last.fm response was too large.', 'response-too-large')
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LastFmError('Last.fm took too long to respond.', 'timeout')
      }
      throw new LastFmError('Last.fm could not be reached.', 'network-error')
    } finally {
      clearTimeout(timer)
    }
  }
}

function parseTopItems(payload: LastFmEnvelope, kind: JumbleKind): JumbleCandidate[] {
  const container =
    kind === 'artist'
      ? payload.topartists
      : kind === 'album'
        ? payload.topalbums
        : payload.toptracks
  if (!isRecord(container)) return []
  const rawItems = Array.isArray(container[kind]) ? container[kind].slice(0, 200) : []
  return rawItems.flatMap((raw) => parseTopItem(raw, kind))
}

function parseTopItem(value: unknown, kind: JumbleKind): JumbleCandidate[] {
  if (!isRecord(value)) return []
  const answer = stringValue(value.name)
  if (answer === undefined || answer.trim().length < 2) return []
  const artistName =
    kind === 'artist'
      ? undefined
      : isRecord(value.artist)
        ? stringValue(value.artist.name)
        : stringValue(value.artist)
  const albumName =
    kind === 'track' && isRecord(value.album)
      ? stringValue(value.album.name)
      : kind === 'album'
        ? answer
        : undefined
  const imageUrl =
    firstImage(value.image) ??
    (kind === 'track' && isRecord(value.album) ? firstImage(value.album.image) : undefined)
  return [
    {
      kind,
      answer: answer.trim(),
      artistName,
      albumName,
      imageUrl,
      playcount: numberValue(value.playcount),
      listeners: numberValue(value.listeners),
      mbid: stringValue(value.mbid),
      releaseDate: stringValue(value.releasedate) ?? stringValue(value.date),
      releaseType: kind === 'album' ? stringValue(value.type) : undefined,
      durationMs: kind === 'track' ? numberValue(value.duration) : undefined,
      sourceUrl: stringValue(value.url)
    }
  ]
}

function mergeDetails(
  candidate: JumbleCandidate,
  payload: LastFmEnvelope,
  kind: JumbleKind
): JumbleCandidate {
  const root = payload[kind]
  if (!isRecord(root)) return candidate
  const tags =
    isRecord(root.tags) && Array.isArray(root.tags.tag)
      ? root.tags.tag
          .slice(0, 16)
          .flatMap((tag) =>
            isRecord(tag) && stringValue(tag.name) !== undefined ? [stringValue(tag.name)!] : []
          )
      : undefined
  const wiki = isRecord(root.wiki) ? stringValue(root.wiki.summary) : undefined
  const releaseDate = stringValue(root.releasedate) ?? stringValue(root.date)
  const artistName =
    stringValue(root.artist) ?? (isRecord(root.artist) ? stringValue(root.artist.name) : undefined)
  const albumName =
    stringValue(root.album) ??
    (isRecord(root.album)
      ? (stringValue(root.album.title) ?? stringValue(root.album.name))
      : undefined)
  const duration = numberValue(root.duration)
  const stats = isRecord(root.stats) ? root.stats : undefined
  return {
    ...candidate,
    imageUrl: candidate.imageUrl ?? firstImage(root.image),
    mbid: candidate.mbid ?? stringValue(root.mbid),
    artistName: candidate.artistName ?? artistName,
    albumName: candidate.albumName ?? albumName,
    playcount: candidate.playcount ?? numberValue(root.playcount) ?? numberValue(stats?.playcount),
    listeners: candidate.listeners ?? numberValue(root.listeners) ?? numberValue(stats?.listeners),
    tags: tags === undefined || tags.length === 0 ? candidate.tags : tags,
    summary: candidate.summary ?? wiki,
    releaseDate: candidate.releaseDate ?? releaseDate,
    durationMs: candidate.durationMs ?? duration
  }
}

function mergeArtistDetails(candidate: JumbleCandidate, payload: LastFmEnvelope): JumbleCandidate {
  const root = payload.artist
  if (!isRecord(root)) return candidate
  const tags = parseTags(root.tags)
  const stats = isRecord(root.stats) ? root.stats : undefined
  const metadata: JumbleArtistMetadata = {
    mbid: stringValue(root.mbid),
    tags,
    summary: isRecord(root.bio) ? stringValue(root.bio.summary) : undefined,
    countryCode: undefined
  }
  return {
    ...candidate,
    artistMetadata: {
      ...candidate.artistMetadata,
      ...metadata,
      tags: mergeTagValues(candidate.artistMetadata?.tags, tags),
      summary: candidate.artistMetadata?.summary ?? metadata.summary
    },
    mbid: candidate.kind === 'artist' ? (candidate.mbid ?? metadata.mbid) : candidate.mbid,
    playcount:
      candidate.kind === 'artist'
        ? (candidate.playcount ?? numberValue(root.playcount) ?? numberValue(stats?.playcount))
        : candidate.playcount,
    listeners:
      candidate.kind === 'artist'
        ? (candidate.listeners ?? numberValue(root.listeners) ?? numberValue(stats?.listeners))
        : candidate.listeners
  }
}

function parseTags(value: unknown): string[] | undefined {
  if (!isRecord(value)) return undefined
  const tags = Array.isArray(value.tag) ? value.tag : []
  const names = tags
    .filter(isRecord)
    .map((tag) => stringValue(tag.name))
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names.slice(0, 8)
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

function mergeTagValues(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])]
  const unique = [...new Map(values.map((value) => [normalizeAnswer(value), value])).values()]
  return unique.length === 0 ? undefined : unique.slice(0, 8)
}

function firstImage(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const ranked = value
    .filter((entry): entry is LastFmImage => isRecord(entry))
    .sort((first, second) => imageRank(String(second.size)) - imageRank(String(first.size)))
  for (const entry of ranked) {
    const url = stringValue(entry['#text'])
    if (
      url !== undefined &&
      url.startsWith('http') &&
      !url.includes('2a96cbd8b46e442fc41c2b86b821562f')
    )
      return url
  }
  return undefined
}

function imageRank(size: string): number {
  return { mega: 5, extralarge: 4, large: 3, medium: 2, small: 1 }[size] ?? 0
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/u, '').slice(0, 64)
}

function isEnvelope(value: unknown): value is LastFmEnvelope {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 512)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
