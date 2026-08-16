import { expect, test } from 'vite-plus/test'
import { DeezerClient } from '../../src/jumble/deezer.ts'
import { LastFmClient } from '../../src/jumble/lastfm.ts'
import type { JumbleTimingEvent } from '../../src/jumble/timing.ts'

test('parses Last.fm top albums and uses the largest non-placeholder image', async () => {
  const calls: string[] = []
  const client = new LastFmClient({
    apiKey: 'test-key',
    fetchImpl: async (input) => {
      calls.push(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url)
      return new Response(
        JSON.stringify({
          topalbums: {
            album: [
              {
                name: 'Homogenic',
                artist: { name: 'Björk' },
                playcount: '123',
                image: [
                  { '#text': 'https://example.test/small.png', size: 'small' },
                  { '#text': 'https://example.test/large.png', size: 'extralarge' }
                ]
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
  })
  await expect(client.getCandidates('album', 'tasky')).resolves.toEqual([
    expect.objectContaining({
      answer: 'Homogenic',
      artistName: 'Björk',
      imageUrl: 'https://example.test/large.png',
      playcount: 123
    })
  ])
  expect(calls[0]).toContain('method=user.gettopalbums')
  expect(calls[0]).toContain('user=tasky')
})

test('hydrates a top track before requiring its nested album artwork', async () => {
  const client = new LastFmClient({
    apiKey: 'test-key',
    fetchImpl: async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      const method = url.searchParams.get('method')
      if (method === 'user.gettoptracks') {
        return jsonResponse({
          toptracks: {
            track: [
              {
                name: 'Planet',
                artist: { name: 'The Neighbourhood' },
                playcount: '42',
                image: [
                  {
                    '#text':
                      'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png',
                    size: 'extralarge'
                  }
                ]
              }
            ]
          }
        })
      }
      if (method === 'track.getinfo') {
        return jsonResponse({
          track: {
            name: 'Planet',
            album: {
              title: '(((((ultraSOUND)))))',
              image: [
                { '#text': 'https://example.test/medium.png', size: 'medium' },
                { '#text': 'https://example.test/large.png', size: 'extralarge' }
              ]
            }
          }
        })
      }
      return jsonResponse({ artist: { name: 'The Neighbourhood' } })
    }
  })

  const candidates = await client.getCandidates('track', 'tasky')
  expect(candidates[0]?.imageUrl).toBeUndefined()

  await expect(client.hydrate(candidates[0])).resolves.toMatchObject({
    albumName: '(((((ultraSOUND)))))',
    imageUrl: 'https://example.test/large.png',
    imageUrls: ['https://example.test/large.png', 'https://example.test/medium.png']
  })
})

test('uses Deezer artwork for Cloudy Hollow when Last.fm and MusicBrainz have no cover', async () => {
  const timing: JumbleTimingEvent[] = []
  const deezer = new DeezerClient({
    fetchImpl: async () =>
      jsonResponse({
        data: [
          {
            id: 1_256_287_182,
            title: 'Cloudy Hollow',
            duration: 264,
            artist: { id: 77_236_572, name: 'Pretty Patterns' },
            album: {
              id: 210_439_932,
              title: 'Cloudy Hollow',
              cover_xl: 'https://images.example.test/cloudy-hollow.jpg'
            }
          }
        ]
      })
  })
  const client = new LastFmClient({
    apiKey: 'test-key',
    deezer,
    musicBrainz: { enrich: async (candidate) => candidate },
    onTiming: (event) => timing.push(event),
    fetchImpl: async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      const method = url.searchParams.get('method')
      if (method === 'track.getinfo') {
        return jsonResponse({
          track: {
            name: 'Cloudy Hollow',
            artist: { name: 'Pretty Patterns' },
            album: { title: 'Cloudy Hollow', image: [] }
          }
        })
      }
      return jsonResponse({ artist: { name: 'Pretty Patterns' } })
    }
  })

  await expect(
    client.hydrate({
      kind: 'track',
      answer: 'Cloudy Hollow',
      artistName: 'Pretty Patterns',
      playcount: 66
    })
  ).resolves.toMatchObject({
    imageUrl: 'https://images.example.test/cloudy-hollow.jpg',
    playcount: 66
  })
  expect(timing).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'provider',
        provider: 'lastfm',
        operation: 'details',
        kind: 'track',
        outcome: 'success',
        imageCount: 0
      }),
      expect.objectContaining({
        type: 'provider',
        provider: 'musicbrainz',
        operation: 'enrichment',
        outcome: 'unchanged'
      }),
      expect.objectContaining({
        type: 'provider',
        provider: 'deezer',
        operation: 'enrichment',
        outcome: 'success',
        imageCount: 1
      })
    ])
  )
  expect(JSON.stringify(timing)).not.toContain('Cloudy Hollow')
  expect(JSON.stringify(timing)).not.toContain('Pretty Patterns')
})

test('defers optional deep enrichment after Last.fm makes an album playable', async () => {
  let finishEnrichment!: () => void
  const enrichmentBlocked = new Promise<void>((resolve) => {
    finishEnrichment = resolve
  })
  const client = new LastFmClient({
    apiKey: 'test-key',
    fetchImpl: async (input) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      return url.searchParams.get('method') === 'album.getinfo'
        ? jsonResponse({
            album: {
              name: 'Homogenic',
              artist: 'Björk',
              listeners: '1000',
              image: [
                {
                  '#text': 'https://example.test/homogenic.png',
                  size: 'extralarge'
                }
              ]
            }
          })
        : jsonResponse({ artist: { name: 'Björk', listeners: '2000' } })
    },
    musicBrainz: {
      async enrich(candidate) {
        await enrichmentBlocked
        return { ...candidate, sourceUrl: 'https://musicbrainz.test/release' }
      }
    }
  })

  const result = await client.hydrateForStart({
    kind: 'album',
    answer: 'Homogenic',
    artistName: 'Björk',
    imageUrl: 'https://example.test/top-list.png'
  })

  expect(result).toMatchObject({
    status: 'deferred',
    candidate: {
      answer: 'Homogenic',
      imageUrl: 'https://example.test/top-list.png',
      listeners: 1000
    }
  })
  if (result.status !== 'deferred') throw new Error('Expected optional enrichment to be deferred.')

  finishEnrichment()
  await expect(result.completion).resolves.toMatchObject({
    sourceUrl: 'https://musicbrainz.test/release'
  })
})

test('awaits deep enrichment when Last.fm still has no playable artwork', async () => {
  let enrichments = 0
  const client = new LastFmClient({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ album: { name: 'Missing Art', image: [] } }),
    musicBrainz: {
      async enrich(candidate) {
        enrichments += 1
        return { ...candidate, imageUrl: 'https://example.test/musicbrainz.png' }
      }
    }
  })

  await expect(
    client.hydrateForStart({
      kind: 'album',
      answer: 'Missing Art',
      artistName: 'Unknown Artist'
    })
  ).resolves.toMatchObject({
    status: 'complete',
    candidate: { imageUrl: 'https://example.test/musicbrainz.png' }
  })
  expect(enrichments).toBe(1)
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
