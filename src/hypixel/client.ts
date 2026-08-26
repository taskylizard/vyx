import { clamp } from 'radashi'
import { type ZodType, z } from 'zod'
import { readBoundedJson } from '../shared/http.ts'
import {
  BazaarResponseSchema,
  type BazaarProduct,
  HypixelPlayerSchema,
  type HypixelItem,
  ItemsResourceSchema,
  type SkillDefinition,
  SkillsResourceSchema,
  SkyblockProfilesResponseSchema,
  type SkyblockProfile
} from './schemas.ts'

const DEFAULT_BASE_URL = 'https://api.hypixel.net'
const DEFAULT_USER_AGENT = 'Kanikou/0.0.0 (https://github.com/taskylizard/kanikou)'
const PROFILE_TTL_MS = 5 * 60_000
const BAZAAR_TTL_MS = 60_000
const RESOURCE_TTL_MS = 6 * 60 * 60_000

export interface HypixelClientOptions {
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  maxResponseBytes?: number
  now?: () => number
  onError?: (error: unknown) => void
  timeoutMs?: number
}

export class HypixelError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HypixelError'
    this.status = status
  }
}

interface CacheEntry {
  expiresAt: number
  value: Promise<unknown>
}

/**
 * Read-only Hypixel API v2 client with a small memory TTL cache. Responses are
 * parsed through narrow zod views at this boundary; callers receive typed data.
 */
const PlayerResponseSchema = z.object({ player: HypixelPlayerSchema })

export class HypixelClient {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #cache = new Map<string, CacheEntry>()
  readonly #fetchImpl: typeof fetch
  readonly #maxResponseBytes: number
  readonly #now: () => number
  readonly #onError?: (error: unknown) => void
  readonly #timeoutMs: number

  constructor(options: HypixelClientOptions) {
    this.#apiKey = options.apiKey
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    this.#fetchImpl = options.fetchImpl ?? fetch
    this.#maxResponseBytes = clamp(
      Math.trunc(options.maxResponseBytes ?? 16 * 1024 * 1024),
      64 * 1024,
      64 * 1024 * 1024
    )
    this.#now = options.now ?? Date.now
    this.#onError = options.onError
    this.#timeoutMs = clamp(Math.trunc(options.timeoutMs ?? 15_000), 1_000, 60_000)
  }

  async player(uuid: string): Promise<z.output<typeof HypixelPlayerSchema>> {
    const response = await this.#get('/v2/player', { uuid }, PlayerResponseSchema, PROFILE_TTL_MS)
    return response.player
  }

  /**
   * Resolves the profile the advisor should talk about: the configured name
   * when present, otherwise the player's selected profile.
   */
  async activeProfile(
    uuid: string,
    preferredProfileName?: string
  ): Promise<SkyblockProfile | undefined> {
    const profiles = await this.profiles(uuid)
    const wantedName = preferredProfileName?.trim().toLowerCase()

    const wanted =
      wantedName === undefined || wantedName.length === 0
        ? undefined
        : profiles.find((profile) => profile.cute_name?.toLowerCase() === wantedName)

    // tasky: hypixel's single-profile endpoint rejects cute names ("Malformed UUID"), so the list endpoint is the one reliable resolver
    return wanted ?? profiles.find((profile) => profile.selected) ?? profiles[0]
  }

  async profiles(uuid: string): Promise<SkyblockProfile[]> {
    const response = await this.#get(
      '/v2/skyblock/profiles',
      { uuid },
      SkyblockProfilesResponseSchema,
      PROFILE_TTL_MS
    )
    return response.profiles
  }

  async skills(): Promise<Record<string, SkillDefinition>> {
    const response = await this.#get(
      '/v2/resources/skyblock/skills',
      {},
      SkillsResourceSchema,
      RESOURCE_TTL_MS
    )
    return response.skills
  }

  async items(): Promise<HypixelItem[]> {
    const response = await this.#get(
      '/v2/resources/skyblock/items',
      {},
      ItemsResourceSchema,
      RESOURCE_TTL_MS
    )
    return response.items
  }

  async bazaar(): Promise<Record<string, BazaarProduct>> {
    const response = await this.#get('/v2/skyblock/bazaar', {}, BazaarResponseSchema, BAZAAR_TTL_MS)
    return response.products
  }

  async #get<Schema extends ZodType>(
    path: string,
    params: Record<string, string>,
    schema: Schema,
    ttlMs: number
  ): Promise<z.output<Schema>> {
    const query = new URLSearchParams(params)
    const url = `${this.#baseUrl}${path}${query.size === 0 ? '' : `?${query.toString()}`}`

    const raw = await this.#cachedRaw(url, ttlMs)
    return schema.parse(raw)
  }

  /**
   * Caches the raw response promise per URL so concurrent callers share one
   * request and failed requests are retried on the next call.
   */
  #cachedRaw(url: string, ttlMs: number): Promise<unknown> {
    const cached = this.#cache.get(url)
    if (cached !== undefined && cached.expiresAt > this.#now()) return cached.value

    const promise = this.#requestRaw(url).catch((error: unknown) => {
      this.#cache.delete(url)
      throw error
    })
    this.#cache.set(url, { expiresAt: this.#now() + ttlMs, value: promise })
    return promise
  }

  async #requestRaw(url: string): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    try {
      const response = await this.#fetchImpl(url, {
        headers: {
          accept: 'application/json',
          'user-agent': DEFAULT_USER_AGENT,
          // tasky: hypixel's edge validates this header name case-sensitively; any other casing 400s with "Missing API-Key header"
          'API-Key': this.#apiKey
        },
        signal: controller.signal
      })

      if (!response.ok) {
        const cause = await describeErrorBody(response)
        throw new HypixelError(`Hypixel API returned ${response.status}: ${cause}`, response.status)
      }

      const payload: unknown = await readBoundedJson(response, this.#maxResponseBytes)
      if (!SuccessEnvelopeSchema.safeParse(payload).success) {
        throw new HypixelError('Hypixel API reported a failed request.')
      }

      return payload
    } catch (error) {
      if (error instanceof HypixelError) throw error
      this.#report(error)
      const message = error instanceof Error ? error.message : String(error)
      throw new HypixelError(`Hypixel API request failed: ${message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  #report(error: unknown): void {
    this.#onError?.(error)
  }
}

const SuccessEnvelopeSchema = z.object({ success: z.literal(true) })

async function describeErrorBody(response: Response): Promise<string> {
  const payload = await readBoundedJson(response, 4096).catch(() => undefined)
  const parsed = ErrorCauseSchema.safeParse(payload)
  return parsed.success ? (parsed.data.cause ?? 'no cause provided') : 'unreadable error body'
}

const ErrorCauseSchema = z.object({ cause: z.string().optional().nullish() })
