import { createHash } from 'node:crypto'
import { afterAll, beforeAll, bench, describe } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { LastFmClient } from '../../src/jumble/lastfm.ts'
import { JumbleMetadataCache } from '../../src/jumble/metadata-cache.ts'

let database: ReturnType<typeof createKanikouDatabase>
let cache: JumbleMetadataCache
let coldIteration = 0

beforeAll(async () => {
  database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  cache = new JumbleMetadataCache(database.db)
  await cache.set(
    `lastfm:v1:top:track:100:${createHash('sha256').update('tasky').digest('hex')}`,
    [
      {
        kind: 'track',
        answer: 'Cloudy Hollow',
        artistName: 'Pretty Patterns',
        playcount: 66
      }
    ],
    24 * 60 * 60 * 1_000
  )
})

afterAll(() => {
  database.close()
})

describe('Last.fm persistent candidate cache', () => {
  bench(
    'loads a top-track list after the client restarts',
    async () => {
      const options = {
        apiKey: 'test-key',
        cache,
        fetchImpl: async () => {
          await delay(40)
          return jsonResponse({
            toptracks: {
              track: [
                {
                  name: 'Cloudy Hollow',
                  artist: { name: 'Pretty Patterns' },
                  playcount: '66'
                }
              ]
            }
          })
        }
      }
      const client = new LastFmClient(options)
      await client.getCandidates('track', 'tasky')
    },
    { time: 1_500, warmupIterations: 3, warmupTime: 100 }
  )
})

describe('Last.fm cold candidate load', () => {
  bench(
    'parses a cold top-track list without persistence',
    async () => {
      const client = new LastFmClient({
        apiKey: 'test-key',
        fetchImpl: async () => topTrackResponse()
      })
      await client.getCandidates('track', `network-only-${coldIteration}`)
      coldIteration += 1
    },
    { iterations: 1_000, warmupIterations: 100 }
  )

  bench(
    'parses and persists a cold top-track list',
    async () => {
      const client = new LastFmClient({
        apiKey: 'test-key',
        cache,
        fetchImpl: async () => topTrackResponse()
      })
      await client.getCandidates('track', `persistent-${coldIteration}`)
      coldIteration += 1
    },
    { iterations: 1_000, warmupIterations: 100 }
  )
})

function topTrackResponse(): Response {
  return jsonResponse({
    toptracks: {
      track: [
        {
          name: 'Cloudy Hollow',
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
