import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vite-plus/test'
import { z } from 'zod'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { jumbleMetadataCache } from '../../src/database/schemas/jumble.ts'
import { JumbleMetadataCache } from '../../src/jumble/metadata-cache.ts'

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

test('returns cached values only after schema validation', async () => {
  const schema = z.object({ name: z.string(), listeners: z.number() })

  await expect(cache.set('artist:bjork', { name: 'Björk', listeners: 42 }, 60_000)).resolves.toBe(
    true
  )
  await expect(cache.get('artist:bjork', schema)).resolves.toMatchObject({
    fresh: true,
    value: { name: 'Björk', listeners: 42 }
  })
})

test('deletes cached values that fail their boundary schema', async () => {
  await cache.set('artist:bjork', { name: 'Björk', listeners: 'many' }, 60_000)

  await expect(
    cache.get('artist:bjork', z.object({ name: z.string(), listeners: z.number() }))
  ).resolves.toBeNull()
  await expect(
    database.db
      .select()
      .from(jumbleMetadataCache)
      .where(eq(jumbleMetadataCache.cacheKey, 'artist:bjork'))
  ).resolves.toEqual([])
})
