import { expect, test, vi } from 'vite-plus/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { jumbleLibraryItems } from '../../src/database/schemas/jumble.ts'
import { JumbleLibrary } from '../../src/jumble/library.ts'
import { JumbleLibraryRepository } from '../../src/jumble/library-repository.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleCandidate, JumbleKind } from '../../src/jumble/types.ts'

const candidate = (answer: string, kind: JumbleKind = 'artist'): JumbleCandidate => {
  if (kind === 'artist') return { kind, answer, imageUrl: 'https://example.test/art.png' }
  return {
    kind,
    answer,
    artistName: 'Indexed Artist',
    imageUrl: 'https://example.test/art.png'
  }
}

async function fixture(now = 1_000) {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  const getCandidates = vi.fn(async (kind: JumbleKind, username: string) => [
    candidate(username, kind)
  ])
  const repository = new JumbleRepository(database.db)
  const provider = {
    getCandidates,
    async getHints() {
      return []
    }
  }
  const library = new JumbleLibrary(repository, provider, {
    now: () => now,
    freshMs: 100
  })
  return { database, directory, getCandidates, library, provider, repository }
}

test('coalesces a missing refresh and serves the durable generation idempotently', async () => {
  const { database, directory, getCandidates, library } = await fixture()
  const [first, second] = await Promise.all([
    library.get('user', 'artist', 'Tasky'),
    library.get('user', 'artist', 'Tasky')
  ])
  expect(first).toEqual(second)
  expect(getCandidates).toHaveBeenCalledTimes(1)
  await expect(library.get('user', 'artist', 'tasky')).resolves.toEqual(first)
  expect(getCandidates).toHaveBeenCalledTimes(1)
  library.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('waits for another instance to publish instead of duplicating provider work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const getCandidates = vi.fn(async () => {
    await blocked
    return [candidate('shared')]
  })
  const provider = {
    getCandidates,
    async getHints() {
      return []
    }
  }
  const first = new JumbleLibrary(new JumbleRepository(database.db), provider)
  const second = new JumbleLibrary(new JumbleRepository(database.db), provider, {
    contentionPollMs: 5,
    contentionWaitMs: 500
  })

  const firstRead = first.get('user', 'artist', 'name')
  await vi.waitFor(() => expect(getCandidates).toHaveBeenCalledTimes(1))
  const secondRead = second.get('user', 'artist', 'name')
  await new Promise((resolve) => setTimeout(resolve, 25))
  expect(getCandidates).toHaveBeenCalledTimes(1)
  release()
  await expect(Promise.all([firstRead, secondRead])).resolves.toEqual([
    [candidate('shared')],
    [candidate('shared')]
  ])
  expect(getCandidates).toHaveBeenCalledTimes(1)

  first.stop()
  second.stop()
  await Promise.all([first.drain(), second.drain()])
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('stale rows remain foreground-safe while refresh fails', async () => {
  let now = 1_000
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  const getCandidates = vi.fn(async () => [candidate('old')])
  const library = new JumbleLibrary(
    new JumbleRepository(database.db),
    {
      getCandidates,
      async getHints() {
        return []
      }
    },
    { now: () => now, freshMs: 10 }
  )
  await library.get('user', 'artist', 'name')
  now = 2_000
  getCandidates.mockRejectedValueOnce(new Error('offline'))
  await expect(library.get('user', 'artist', 'name')).resolves.toEqual([candidate('old')])
  await vi.waitFor(() => expect(getCandidates).toHaveBeenCalledTimes(2))
  library.stop()
  now = 3_000
  await expect(library.get('user', 'artist', 'name')).resolves.toEqual([candidate('old')])
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(getCandidates).toHaveBeenCalledTimes(2)
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('does not serve old rows after a username change', async () => {
  const { database, directory, library } = await fixture()
  await library.get('user', 'artist', 'old')
  await expect(library.get('user', 'artist', 'new')).resolves.toEqual([candidate('new')])
  await expect(database.db.select().from(jumbleLibraryItems)).resolves.toHaveLength(1)
  library.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('reports tracked counts for the active profile generations', async () => {
  const { database, directory, library } = await fixture()
  await Promise.all(
    (['artist', 'album', 'track'] as const).map((kind) => library.get('user', kind, 'tasky'))
  )

  await expect(library.trackedCounts('user', 'tasky')).resolves.toEqual({
    all: 3,
    artist: 1,
    album: 1,
    track: 1
  })

  library.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('deletes corrupt active rows and repairs them from the provider', async () => {
  const { database, directory, getCandidates, library } = await fixture()
  await library.get('user', 'artist', 'name')
  await database.db.update(jumbleLibraryItems).set({ candidate: '{bad json' })

  await expect(library.get('user', 'artist', 'name')).resolves.toEqual([candidate('name')])
  expect(getCandidates).toHaveBeenCalledTimes(2)
  const rows = await database.db.select().from(jumbleLibraryItems)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.candidate).not.toBe('{bad json')

  library.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('saved profiles use the warm index while explicit usernames bypass it', async () => {
  const { database, directory, getCandidates, library, provider, repository } = await fixture()
  await repository.setProfile('user', 'saved')
  await library.get('user', 'artist', 'saved')
  const service = new JumbleService(repository, provider, { library, randomIndex: () => 0 })

  await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'saved-channel',
    kind: 'artist'
  })
  expect(getCandidates).toHaveBeenCalledTimes(1)

  await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'explicit-channel',
    kind: 'artist',
    username: 'explicit'
  })
  expect(getCandidates).toHaveBeenCalledTimes(2)
  expect(getCandidates).toHaveBeenLastCalledWith('artist', 'explicit', 600)

  service.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('an explicit override leaves the saved profile and its index untouched', async () => {
  const { database, directory, getCandidates, library, provider, repository } = await fixture()
  await repository.setProfile('user', 'taskyliz')
  await library.get('user', 'album', 'taskyliz')
  const service = new JumbleService(repository, provider, { library, randomIndex: () => 0 })

  const override = await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'override-channel',
    kind: 'album',
    username: 'lastfm'
  })
  const saved = await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'saved-channel',
    kind: 'album'
  })

  expect(override.state.session.sourceUsername).toBe('lastfm')
  expect(saved.state.session.sourceUsername).toBe('taskyliz')
  await expect(service.getProfile('user')).resolves.toBe('taskyliz')
  expect(getCandidates).toHaveBeenCalledTimes(2)

  service.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('persists deferred start enrichment after the foreground game begins', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  const base = {
    kind: 'album',
    answer: 'Foreground Album',
    artistName: 'Indexed Artist',
    imageUrl: 'https://example.test/art.png'
  } satisfies JumbleCandidate
  let finishEnrichment!: (value: JumbleCandidate) => void
  const completion = new Promise<JumbleCandidate>((resolve) => {
    finishEnrichment = resolve
  })
  const provider = {
    async getCandidates() {
      return [base]
    },
    async hydrateForStart(selected: JumbleCandidate) {
      return { status: 'deferred' as const, candidate: selected, completion }
    },
    async getHints() {
      return []
    }
  }
  const repository = new JumbleRepository(database.db)
  await repository.setProfile('user', 'saved')
  const library = new JumbleLibrary(repository, provider)
  await library.get('user', 'album', 'saved')
  const service = new JumbleService(repository, provider, { library, randomIndex: () => 0 })

  const started = await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'channel',
    kind: 'album'
  })
  expect(started.state.session.metadata.candidate.releaseDate).toBeUndefined()

  finishEnrichment({ ...base, releaseDate: '2026-08-06' })
  await service.drain()
  await expect(library.get('user', 'album', 'saved')).resolves.toMatchObject([
    { answer: 'Foreground Album', releaseDate: '2026-08-06' }
  ])

  service.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('does not persist deferred enrichment under a different candidate identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  const base = {
    kind: 'album',
    answer: 'Expected Album',
    artistName: 'Indexed Artist',
    imageUrl: 'https://example.test/art.png',
    listeners: 123
  } satisfies JumbleCandidate
  let finishEnrichment!: (value: JumbleCandidate) => void
  const completion = new Promise<JumbleCandidate>((resolve) => {
    finishEnrichment = resolve
  })
  const provider = {
    async getCandidates() {
      return [base]
    },
    async hydrateForStart(selected: JumbleCandidate) {
      return { status: 'deferred' as const, candidate: selected, completion }
    },
    async getHints() {
      return []
    }
  }
  const repository = new JumbleRepository(database.db)
  await repository.setProfile('user', 'saved')
  const library = new JumbleLibrary(repository, provider)
  await library.get('user', 'album', 'saved')
  const service = new JumbleService(repository, provider, { library, randomIndex: () => 0 })

  await service.start({
    starterUserId: 'user',
    guildId: 'guild',
    channelId: 'channel',
    kind: 'album'
  })
  finishEnrichment({
    kind: 'album',
    answer: 'Wrong Album',
    artistName: 'Indexed Artist',
    imageUrl: 'https://example.test/art.png',
    releaseDate: '2026-08-06'
  } satisfies JumbleCandidate)
  await service.drain()

  const restored = await library.get('user', 'album', 'saved')
  expect(restored).toMatchObject([{ answer: 'Expected Album', listeners: 123 }])
  expect(restored[0]?.releaseDate).toBeUndefined()

  service.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('profile saves enqueue a bounded refresh for every Jumble kind', async () => {
  const { database, directory, getCandidates, library, provider, repository } = await fixture()
  const service = new JumbleService(repository, provider, { library })

  await service.setProfile('user', 'Tasky')
  await vi.waitFor(() => expect(getCandidates).toHaveBeenCalledTimes(3))
  expect(getCandidates.mock.calls.map(([kind]) => kind)).toEqual(['artist', 'album', 'track'])

  service.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test('preserves hydrated metadata when a stale generation is replaced', async () => {
  let now = 1_000
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
  await database.initialize()
  const getCandidates = vi.fn(async () => [candidate('Björk')])
  const library = new JumbleLibrary(
    new JumbleRepository(database.db),
    {
      getCandidates,
      async getHints() {
        return []
      }
    },
    { freshMs: 10, now: () => now }
  )
  await library.get('user', 'artist', 'name')
  library.remember('user', 'artist', 'name', {
    ...candidate('Björk'),
    answerVariants: [{ source: 'musicbrainz', value: 'Bjork' }]
  })
  await vi.waitFor(async () => {
    await expect(library.get('user', 'artist', 'name')).resolves.toMatchObject([
      { answerVariants: [{ source: 'musicbrainz', value: 'Bjork' }] }
    ])
  })

  now = 2_000
  await library.get('user', 'artist', 'name')
  await vi.waitFor(() => expect(getCandidates).toHaveBeenCalledTimes(2))
  await expect(library.get('user', 'artist', 'name')).resolves.toMatchObject([
    { answerVariants: [{ source: 'musicbrainz', value: 'Bjork' }] }
  ])

  library.stop()
  database.close()
  await rm(directory, { force: true, recursive: true })
})

test.each(['artist', 'album', 'track'] satisfies readonly JumbleKind[])(
  'keeps hydrated metadata scoped to one %s candidate',
  async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-'))
    const database = createKanikouDatabase({ url: `file:${join(directory, 'test.db')}` })
    await database.initialize()
    const candidates = [candidate('first', kind), candidate('second', kind)]
    const library = new JumbleLibrary(
      new JumbleRepository(database.db),
      {
        async getCandidates() {
          return candidates
        },
        async getHints() {
          return []
        }
      },
      { freshMs: 10_000 }
    )

    await library.get('user', kind, 'name')
    library.remember('user', kind, 'name', { ...candidates[0]!, listeners: 123 })
    await library.drain()

    const restored = await library.get('user', kind, 'name')
    expect(restored).toHaveLength(2)
    expect(restored[0]).toMatchObject({ answer: 'first', listeners: 123 })
    expect(restored[1]).toEqual(candidates[1])

    library.stop()
    database.close()
    await rm(directory, { force: true, recursive: true })
  }
)

test('fences obsolete-generation cleanup across a lease handoff', async () => {
  const database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  const first = new JumbleLibraryRepository(new JumbleRepository(database.db).db)
  const second = new JumbleLibraryRepository(new JumbleRepository(database.db).db)

  await expect(
    first.acquireLease({
      discordUserId: 'user',
      kind: 'artist',
      username: 'name',
      owner: 'owner-a',
      now: 0,
      leaseMs: 100
    })
  ).resolves.toBe(true)

  await database.client.execute(`
    CREATE TRIGGER library_lease_handoff AFTER UPDATE OF active_refresh_version
    ON jumble_library_sync
    WHEN NEW.active_refresh_version = 'version-a'
    BEGIN
      UPDATE jumble_library_sync
      SET lease_owner = 'owner-b', lease_expires_at = 999999
      WHERE discord_user_id = 'user' AND kind = 'artist';
      INSERT INTO jumble_library_items
        (discord_user_id, kind, identity_key, candidate, rank, refresh_version, synced_at)
      VALUES
        (
          'user',
          'artist',
          '["artist","b"]',
          '{"kind":"artist","answer":"b","imageUrl":"https://example.test/b.png"}',
          0,
          'version-b',
          2
        );
    END
  `)

  await expect(
    first.replace({
      discordUserId: 'user',
      kind: 'artist',
      username: 'name',
      owner: 'owner-a',
      version: 'version-a',
      candidates: [candidate('a')],
      now: 1,
      refreshAfter: 1_000
    })
  ).resolves.toBe(true)

  await database.client.execute('DROP TRIGGER library_lease_handoff')

  await expect(second.read('user', 'artist', 'name')).resolves.toEqual({
    candidates: [candidate('a')],
    refreshAfter: 1_000
  })
  await expect(
    database.db
      .select()
      .from(jumbleLibraryItems)
      .where(eq(jumbleLibraryItems.refreshVersion, 'version-b'))
  ).resolves.toHaveLength(1)

  await expect(
    second.replace({
      discordUserId: 'user',
      kind: 'artist',
      username: 'name',
      owner: 'owner-b',
      version: 'version-b',
      candidates: [candidate('b')],
      now: 2,
      refreshAfter: 2_000
    })
  ).resolves.toBe(true)
  await expect(second.read('user', 'artist', 'name')).resolves.toEqual({
    candidates: [candidate('b')],
    refreshAfter: 2_000
  })

  database.close()
})
