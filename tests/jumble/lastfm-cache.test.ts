import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { jumbleMetadataCache } from '../../src/database/schemas/jumble.ts'
import { LastFmClient } from '../../src/jumble/lastfm.ts'
import { JumbleMetadataCache } from '../../src/jumble/metadata-cache.ts'

const TRACK_CACHE_KEY = `lastfm:v1:top:track:100:${createHash('sha256').update('tasky').digest('hex')}`
const DAY_MS = 24 * 60 * 60 * 1_000
let database: ReturnType<typeof createKanikouDatabase>
let cache: JumbleMetadataCache

beforeEach(async () => {
  database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  cache = new JumbleMetadataCache(database.db)
})

afterEach(() => {
  database.close()
})

test('persists normalized Last.fm candidates across client instances', async () => {
  let fetches = 0
  const firstOptions = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => {
      fetches += 1
      return topTrackResponse('Cloudy Hollow')
    }
  }
  const first = new LastFmClient(firstOptions)
  await expect(first.getCandidates('track', 'tasky')).resolves.toMatchObject([
    { kind: 'track', answer: 'Cloudy Hollow', artistName: 'Pretty Patterns' }
  ])

  const secondOptions = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => {
      fetches += 1
      throw new Error('network should not be used')
    }
  }
  const second = new LastFmClient(secondOptions)
  await expect(second.getCandidates('track', 'tasky')).resolves.toMatchObject([
    { kind: 'track', answer: 'Cloudy Hollow', artistName: 'Pretty Patterns' }
  ])
  expect(fetches).toBe(1)

  const rows = await database.db
    .select()
    .from(jumbleMetadataCache)
    .where(eq(jumbleMetadataCache.cacheKey, TRACK_CACHE_KEY))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.payload).toContain('"kind":"track"')
  expect(rows[0]?.payload).not.toContain('toptracks')
})

test('uses a stale persisted top list when Last.fm is unavailable', async () => {
  const staleCache = new JumbleMetadataCache(database.db, {
    now: () => Date.now() - 16 * 60_000
  })
  await staleCache.set(
    TRACK_CACHE_KEY,
    [
      {
        kind: 'track',
        answer: 'Stale Track',
        artistName: 'Cached Artist',
        playcount: 42
      }
    ],
    DAY_MS
  )
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => {
      throw new Error('Last.fm is down')
    }
  }

  await expect(new LastFmClient(options).getCandidates('track', 'tasky')).resolves.toMatchObject([
    { answer: 'Stale Track', artistName: 'Cached Artist', playcount: 42 }
  ])
})

test('refreshes a stale persisted top list when Last.fm responds', async () => {
  const staleCache = new JumbleMetadataCache(database.db, {
    now: () => Date.now() - 16 * 60_000
  })
  await staleCache.set(
    TRACK_CACHE_KEY,
    [{ kind: 'track', answer: 'Stale Track', artistName: 'Cached Artist' }],
    DAY_MS
  )
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => topTrackResponse('Updated Track')
  }

  await expect(new LastFmClient(options).getCandidates('track', 'tasky')).resolves.toMatchObject([
    { answer: 'Updated Track', artistName: 'Pretty Patterns' }
  ])
  const rows = await database.db
    .select()
    .from(jumbleMetadataCache)
    .where(eq(jumbleMetadataCache.cacheKey, TRACK_CACHE_KEY))
  expect(rows[0]?.payload).toContain('Updated Track')
  expect(rows[0]?.payload).not.toContain('Stale Track')
})

test('does not use a persisted top list beyond the stale safety window', async () => {
  const expiredCache = new JumbleMetadataCache(database.db, {
    now: () => Date.now() - DAY_MS - 1
  })
  await expiredCache.set(
    TRACK_CACHE_KEY,
    [{ kind: 'track', answer: 'Expired Track', artistName: 'Cached Artist' }],
    DAY_MS
  )
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => topTrackResponse('Current Track')
  }

  await expect(new LastFmClient(options).getCandidates('track', 'tasky')).resolves.toMatchObject([
    { answer: 'Current Track' }
  ])
})

test('deduplicates concurrent top-list loads before writing the persistent cache', async () => {
  let unblock!: () => void
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  let started!: () => void
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let fetches = 0
  const cacheReads = vi.spyOn(cache, 'get')
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => {
      fetches += 1
      started()
      await blocked
      return topTrackResponse('Concurrent Track')
    }
  }
  const client = new LastFmClient(options)

  const first = client.getCandidates('track', 'tasky')
  const second = client.getCandidates('track', 'tasky')
  await requestStarted
  unblock()

  await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  await expect(client.getCandidates('track', 'tasky')).resolves.toHaveLength(1)
  expect(fetches).toBe(1)
  expect(cacheReads).toHaveBeenCalledOnce()
  const rows = await database.db
    .select()
    .from(jumbleMetadataCache)
    .where(eq(jumbleMetadataCache.cacheKey, TRACK_CACHE_KEY))
  expect(rows).toHaveLength(1)
})

test('replaces malformed persisted data with a validated network result', async () => {
  const now = Date.now()
  await database.db.insert(jumbleMetadataCache).values({
    cacheKey: TRACK_CACHE_KEY,
    payload: '{"unexpected":true}',
    fetchedAt: now,
    expiresAt: now + DAY_MS
  })
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => topTrackResponse('Recovered Track')
  }

  await expect(new LastFmClient(options).getCandidates('track', 'tasky')).resolves.toMatchObject([
    { answer: 'Recovered Track' }
  ])
  const rows = await database.db
    .select()
    .from(jumbleMetadataCache)
    .where(eq(jumbleMetadataCache.cacheKey, TRACK_CACHE_KEY))
  expect(rows[0]?.payload).toContain('Recovered Track')
  expect(rows[0]?.payload).not.toContain('unexpected')
})

test('bounds persistent cache keys for Unicode and adversarial usernames', async () => {
  const username = `@${'界'.repeat(64)}`
  const options = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => topTrackResponse('Unicode Track')
  }

  await new LastFmClient(options).getCandidates('track', username)
  const rows = await database.db.select().from(jumbleMetadataCache)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.cacheKey.length).toBeLessThanOrEqual(512)
  expect(rows[0]?.cacheKey).toMatch(/^lastfm:v1:top:track:100:[a-f\d]{64}$/u)
  expect(rows[0]?.cacheKey).not.toContain('界')
})

test('does not persist empty or oversized top lists', async () => {
  const emptyOptions = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () => jsonResponse({ toptracks: { track: [] } })
  }
  await expect(
    new LastFmClient(emptyOptions).getCandidates('track', 'empty-user')
  ).rejects.toMatchObject({ code: 'empty-results' })

  const oversizedOptions = {
    apiKey: 'test-key',
    cache,
    fetchImpl: async () =>
      jsonResponse({
        toptracks: {
          track: Array.from({ length: 200 }, (_, index) => ({
            name: `Track ${index} ${'x'.repeat(500)}`,
            artist: { name: `Artist ${index} ${'y'.repeat(500)}` },
            playcount: String(index)
          }))
        }
      })
  }
  await expect(
    new LastFmClient(oversizedOptions).getCandidates('track', 'oversized-user', 200)
  ).resolves.toHaveLength(200)

  const rows = await database.db.select().from(jumbleMetadataCache)
  expect(rows).toHaveLength(0)
})

function topTrackResponse(name: string): Response {
  return jsonResponse({
    toptracks: {
      track: [
        {
          name,
          artist: { name: 'Pretty Patterns' },
          playcount: '66'
        }
      ]
    }
  })
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
