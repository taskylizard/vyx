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
