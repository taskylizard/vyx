import { asc, count, eq, inArray, lt } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { clamp } from 'radashi'
import type { ZodType } from 'zod'
import { jumbleMetadataCache, jumbleSchema } from '../database/schemas/jumble.ts'

const MAX_CACHE_ENTRIES = 65_536
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

export type JumbleMetadataDatabase = LibSQLDatabase<typeof jumbleSchema>

export interface JumbleMetadataCacheOptions {
  maxEntries?: number
  maxPayloadBytes?: number
  pruneEveryWrites?: number
  now?: () => number
  onError?: (error: unknown) => void
}

export interface JumbleMetadataCacheEntry<T> {
  value: T
  fetchedAt: number
  expiresAt: number
  fresh: boolean
}

/**
 * A small persistent cache for normalized enrichment data.
 *
 * The cache is intentionally bounded in both row count and serialized value
 * size.  Cache failures are non-fatal: a game can always fall back to the
 * Last.fm candidate data it already has.
 */
export class JumbleMetadataCache {
  private readonly db: JumbleMetadataDatabase
  private readonly maxEntries: number
  private readonly maxPayloadBytes: number
  private readonly pruneEveryWrites: number
  private readonly now: () => number
  private readonly onError?: (error: unknown) => void
  private writesSincePrune = 0

  constructor(db: JumbleMetadataDatabase, options: JumbleMetadataCacheOptions = {}) {
    this.db = db
    this.maxEntries = clamp(Math.trunc(options.maxEntries ?? 4096), 1, MAX_CACHE_ENTRIES)
    this.maxPayloadBytes = clamp(
      Math.trunc(options.maxPayloadBytes ?? 64 * 1024),
      1024,
      MAX_PAYLOAD_BYTES
    )
    this.pruneEveryWrites = Math.max(1, Math.trunc(options.pruneEveryWrites ?? 32))
    this.now = options.now ?? Date.now
    this.onError = options.onError
  }

  async get<T>(cacheKey: string, schema: ZodType<T>): Promise<JumbleMetadataCacheEntry<T> | null> {
    try {
      const rows = await this.db
        .select()
        .from(jumbleMetadataCache)
        .where(eq(jumbleMetadataCache.cacheKey, cacheKey))
        .limit(1)
      const row = rows.at(0)
      if (row === undefined) return null
      if (Buffer.byteLength(row.payload, 'utf8') > this.maxPayloadBytes) {
        await this.delete(cacheKey)
        return null
      }

      let payload: unknown
      try {
        payload = JSON.parse(row.payload)
      } catch {
        await this.delete(cacheKey)
        return null
      }

      const value = schema.safeParse(payload)
      if (!value.success) {
        await this.delete(cacheKey)
        return null
      }

      return {
        value: value.data,
        fetchedAt: row.fetchedAt,
        expiresAt: row.expiresAt,
        fresh: row.expiresAt > this.now()
      }
    } catch (error) {
      this.report(error)
      return null
    }
  }

  async set(cacheKey: string, value: unknown, ttlMs: number): Promise<boolean> {
    if (cacheKey.trim().length === 0 || cacheKey.length > 512) return false
    let serialized: unknown
    try {
      serialized = JSON.stringify(value)
    } catch (error) {
      this.report(error)
      return false
    }
    if (
      typeof serialized !== 'string' ||
      Buffer.byteLength(serialized, 'utf8') > this.maxPayloadBytes
    )
      return false
    const payload = serialized

    const fetchedAt = this.now()
    const expiresAt = fetchedAt + Math.max(1, Math.trunc(ttlMs))
    try {
      await this.db
        .insert(jumbleMetadataCache)
        .values({ cacheKey, payload, fetchedAt, expiresAt })
        .onConflictDoUpdate({
          target: jumbleMetadataCache.cacheKey,
          set: { payload, fetchedAt, expiresAt }
        })

      this.writesSincePrune += 1
      if (this.writesSincePrune >= this.pruneEveryWrites) {
        this.writesSincePrune = 0
        await this.prune()
      }
      return true
    } catch (error) {
      this.report(error)
      return false
    }
  }

  async delete(cacheKey: string): Promise<void> {
    try {
      await this.db.delete(jumbleMetadataCache).where(eq(jumbleMetadataCache.cacheKey, cacheKey))
    } catch (error) {
      this.report(error)
    }
  }

  async prune(): Promise<void> {
    const now = this.now()
    try {
      await this.db.delete(jumbleMetadataCache).where(lt(jumbleMetadataCache.expiresAt, now))

      const rows = await this.db.select({ total: count() }).from(jumbleMetadataCache)
      let remaining = Math.max(0, (rows.at(0)?.total ?? 0) - this.maxEntries)
      for (let pass = 0; pass < 8 && remaining > 0; pass += 1) {
        const batchSize = Math.min(remaining, 512)
        // eslint-disable-next-line no-await-in-loop -- tasky: sequential batch pruning, each pass evicts the next oldest batch after the prior deletion
        const oldest = await this.db
          .select({ cacheKey: jumbleMetadataCache.cacheKey })
          .from(jumbleMetadataCache)
          .orderBy(asc(jumbleMetadataCache.fetchedAt))
          .limit(batchSize)
        const keys = oldest.map((row) => row.cacheKey)
        if (keys.length === 0) break
        // eslint-disable-next-line no-await-in-loop -- tasky: sequential batch pruning, delete before selecting the next batch
        await this.db.delete(jumbleMetadataCache).where(inArray(jumbleMetadataCache.cacheKey, keys))
        remaining -= keys.length
      }
    } catch (error) {
      this.report(error)
    }
  }

  private report(error: unknown): void {
    this.onError?.(error)
  }
}
