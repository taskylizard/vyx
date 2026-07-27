import { expect, test } from 'vite-plus/test'
import {
  chooseArtist,
  chooseRecording,
  chooseReleaseGroup,
  parseRecording,
  parseRelease
} from '../../src/jumble/musicbrainz-parser.ts'
import { MusicBrainzClient } from '../../src/jumble/musicbrainz.ts'

test('chooses an exact MusicBrainz artist match before score order', () => {
  expect(
    chooseArtist(
      {
        artists: [
          { id: 'other', name: 'Björk tribute', score: 100 },
          { country: 'IS', id: 'artist', name: 'Björk', score: 80 }
        ]
      },
      'Björk'
    )
  ).toEqual({
    countryCode: 'IS',
    mbid: 'artist',
    tags: undefined,
    type: undefined,
    disambiguation: undefined,
    startDate: undefined,
    endDate: undefined
  })
})

test('does not use fuzzy MusicBrainz artist results as accepted aliases', () => {
  expect(
    chooseArtist(
      {
        artists: [{ id: 'tribute', name: 'Björk tribute', score: 100 }]
      },
      'Björk'
    )
  ).toBeUndefined()
})

test('matches exact MusicBrainz aliases for romanized artist and release names', () => {
  expect(
    chooseArtist(
      {
        artists: [
          {
            aliases: [{ locale: 'en', name: 'Hikaru Utada' }],
            id: 'artist',
            name: '宇多田ヒカル',
            score: 100
          }
        ]
      },
      'Hikaru Utada'
    )
  ).toMatchObject({ aliases: ['Hikaru Utada'], mbid: 'artist' })

  expect(
    chooseReleaseGroup(
      {
        'release-groups': [
          {
            aliases: [{ name: 'First Love' }],
            'artist-credit': [{ artist: { aliases: [{ name: 'Hikaru Utada' }] } }],
            id: 'release-group',
            title: 'First Love (ファースト・ラブ)'
          }
        ]
      },
      'First Love',
      'Hikaru Utada'
    )
  ).toMatchObject({ id: 'release-group' })

  expect(
    chooseRecording(
      {
        recordings: [
          {
            aliases: [{ name: 'Automatic' }],
            'artist-credit': [{ artist: { aliases: [{ name: 'Hikaru Utada' }] } }],
            id: 'recording',
            title: 'Automatic (オートマティック)'
          }
        ]
      },
      'Automatic',
      'Hikaru Utada'
    )
  ).toMatchObject({ id: 'recording' })
})

test('parses recording metadata from its preferred dated release', () => {
  expect(
    parseRecording({
      disambiguation: 'studio recording',
      first: 'ignored',
      id: 'recording',
      length: '240000',
      releases: [
        {
          date: '2000-01-01',
          id: 'live-release',
          status: 'Live',
          title: 'Live Album'
        },
        {
          date: '1997-09-20',
          id: 'official-release',
          status: 'Official',
          title: 'Homogenic'
        }
      ]
    })
  ).toMatchObject({
    albumName: 'Homogenic',
    disambiguation: 'studio recording',
    durationMs: 240_000,
    mbid: 'recording',
    releaseMbid: 'official-release',
    releaseDate: '1997-09-20'
  })
})

test('parses MusicBrainz artist aliases', () => {
  expect(
    chooseArtist(
      {
        artists: [
          {
            id: 'artist',
            name: '宇多田ヒカル',
            aliases: [{ name: 'Hikaru Utada' }, { name: 'Utada Hikaru' }]
          }
        ]
      },
      '宇多田ヒカル'
    )
  ).toMatchObject({ aliases: ['Hikaru Utada', 'Utada Hikaru'] })
})

test('adds a Cover Art Archive fallback for a resolved release', async () => {
  const releaseId = '12345678-1234-4234-8234-123456789abc'
  const client = new MusicBrainzClient({
    fetchImpl: async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      if (url.pathname.endsWith('/release-group/')) {
        return jsonResponse({
          'release-groups': [
            {
              id: '87654321-4321-4321-8321-cba987654321',
              title: 'Homogenic',
              score: 100,
              releases: [{ id: releaseId }],
              'artist-credit': [{ name: 'Björk' }]
            }
          ]
        })
      }
      return jsonResponse({
        id: releaseId,
        title: 'Homogenic',
        date: '1997-09-22',
        'cover-art-archive': { artwork: true, front: true },
        'release-group': { title: 'Homogenic', 'primary-type': 'Album' }
      })
    },
    minIntervalMs: 0
  })

  await expect(
    client.enrich({ kind: 'album', answer: 'Homogenic', artistName: 'Björk' })
  ).resolves.toMatchObject({
    imageUrl: `https://coverartarchive.org/release/${releaseId}/front-500`,
    imageUrls: [`https://coverartarchive.org/release/${releaseId}/front-500`]
  })
})

test('does not repeat an artist lookup when Last.fm already supplied artist metadata', async () => {
  const releaseId = '12345678-1234-4234-8234-123456789abc'
  const requests: string[] = []
  const client = new MusicBrainzClient({
    fetchImpl: async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      requests.push(url.pathname)
      if (url.pathname.endsWith('/release-group/')) {
        return jsonResponse({
          'release-groups': [
            {
              id: '87654321-4321-4321-8321-cba987654321',
              title: 'Homogenic',
              score: 100,
              releases: [{ id: releaseId }],
              'artist-credit': [{ name: 'Björk' }]
            }
          ]
        })
      }
      return jsonResponse({
        id: releaseId,
        title: 'Homogenic',
        'cover-art-archive': { artwork: true, front: true },
        'release-group': { title: 'Homogenic', 'primary-type': 'Album' }
      })
    },
    minIntervalMs: 0
  })

  await expect(
    client.enrich({
      kind: 'album',
      answer: 'Homogenic',
      artistName: 'Björk',
      artistMetadata: { summary: 'Existing Last.fm artist metadata.' }
    })
  ).resolves.toMatchObject({
    artistMetadata: { summary: 'Existing Last.fm artist metadata.' },
    imageUrl: `https://coverartarchive.org/release/${releaseId}/front-500`
  })
  expect(requests).toEqual(['/ws/2/release-group/', `/ws/2/release/${releaseId}`])
})

test('uses a release-group Cover Art Archive fallback when no release is resolved', async () => {
  const releaseGroupId = '87654321-4321-4321-8321-cba987654321'
  const client = new MusicBrainzClient({
    fetchImpl: async () =>
      jsonResponse({
        'release-groups': [
          {
            id: releaseGroupId,
            title: 'Homogenic',
            score: 100,
            'cover-art-archive': { artwork: true, front: true },
            'artist-credit': [{ name: 'Björk' }]
          }
        ]
      }),
    minIntervalMs: 0
  })

  await expect(
    client.enrich({ kind: 'album', answer: 'Homogenic', artistName: 'Björk' })
  ).resolves.toMatchObject({
    imageUrl: `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`,
    imageUrls: [`https://coverartarchive.org/release-group/${releaseGroupId}/front-500`]
  })
})

test('does not invent Cover Art Archive URLs without positive front-cover evidence', () => {
  expect(
    parseRelease({
      id: '470bce3d-e95e-4d65-8c71-bf8838ea3247',
      title: 'Cloudy Hollow',
      date: '2021-02-25',
      'cover-art-archive': {
        artwork: false,
        front: false,
        count: 0
      },
      'release-group': {
        id: '41f20921-8f30-488b-8246-6cd10bbf5e8e',
        title: 'Cloudy Hollow'
      }
    })
  ).toMatchObject({
    mbid: '470bce3d-e95e-4d65-8c71-bf8838ea3247',
    imageUrls: undefined
  })
})

test('bounds unique MusicBrainz lookups before a courtesy queue can dominate game latency', async () => {
  let unblockFirst!: () => void
  const firstBlocked = new Promise<void>((resolve) => {
    unblockFirst = resolve
  })
  let firstStarted!: () => void
  const started = new Promise<void>((resolve) => {
    firstStarted = resolve
  })
  let fetches = 0
  let virtualNow = 0
  const client = new MusicBrainzClient({
    fetchImpl: async () => {
      fetches += 1
      if (fetches === 1) {
        firstStarted()
        await firstBlocked
      }
      return jsonResponse({ artists: [] })
    },
    maxQueueWaitMs: 500,
    minIntervalMs: 250,
    now: () => {
      virtualNow += 250
      return virtualNow
    }
  })

  const lookups = Array.from({ length: 8 }, (_, index) =>
    client.enrich({ kind: 'artist', answer: `Unique Artist ${index}` })
  )
  await started

  await expect(lookups[7]).resolves.toEqual({
    kind: 'artist',
    answer: 'Unique Artist 7'
  })
  expect(fetches).toBe(1)

  unblockFirst()
  await expect(Promise.all(lookups)).resolves.toHaveLength(8)
  expect(fetches).toBe(3)
})

test('shares an in-flight MusicBrainz lookup before applying queue admission limits', async () => {
  let unblock!: () => void
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  let started!: () => void
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let fetches = 0
  const client = new MusicBrainzClient({
    fetchImpl: async () => {
      fetches += 1
      started()
      await blocked
      return jsonResponse({ artists: [{ id: 'artist', name: 'Björk' }] })
    },
    maxQueueWaitMs: 0,
    minIntervalMs: 250
  })

  const first = client.enrich({ kind: 'artist', answer: 'Björk' })
  await requestStarted
  const duplicate = client.enrich({ kind: 'artist', answer: 'Björk' })
  unblock()

  await expect(Promise.all([first, duplicate])).resolves.toEqual([
    expect.objectContaining({ artistMetadata: expect.objectContaining({ mbid: 'artist' }) }),
    expect.objectContaining({ artistMetadata: expect.objectContaining({ mbid: 'artist' }) })
  ])
  expect(fetches).toBe(1)
})

test('uses stale MusicBrainz metadata when a new lookup exceeds its queue budget', async () => {
  let unblock!: () => void
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  let started!: () => void
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let fetches = 0
  const client = new MusicBrainzClient({
    cache: {
      async get(_cacheKey, schema) {
        const parsed = schema.safeParse({
          found: true,
          value: { summary: 'Stale artist metadata.' }
        })
        if (!parsed.success) return null
        return {
          value: parsed.data,
          fetchedAt: 0,
          expiresAt: 0,
          fresh: false
        }
      },
      async set() {
        return true
      }
    },
    fetchImpl: async () => {
      fetches += 1
      started()
      await blocked
      return jsonResponse({ artists: [] })
    },
    maxQueueWaitMs: 0,
    minIntervalMs: 250
  })

  const first = client.enrich({ kind: 'artist', answer: 'First Artist' })
  await requestStarted

  await expect(client.enrich({ kind: 'artist', answer: 'Queued Artist' })).resolves.toMatchObject({
    artistMetadata: { summary: 'Stale artist metadata.' }
  })
  expect(fetches).toBe(1)

  unblock()
  await first
})

test('does not negative-cache an unavailable MusicBrainz lookup', async () => {
  const writes: unknown[] = []
  const client = new MusicBrainzClient({
    cache: {
      async get() {
        return null
      },
      async set(cacheKey, value, ttlMs) {
        writes.push({ cacheKey, ttlMs, value })
        return true
      }
    },
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
    minIntervalMs: 0
  })

  await expect(client.enrich({ kind: 'artist', answer: 'Björk' })).resolves.toEqual({
    kind: 'artist',
    answer: 'Björk'
  })
  expect(writes).toEqual([])
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
