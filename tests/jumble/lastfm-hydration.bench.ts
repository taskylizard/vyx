import { afterAll, bench, describe } from 'vite-plus/test'
import { LastFmClient } from '../../src/jumble/lastfm.ts'

let iteration = 0
const pendingEnrichments: Promise<unknown>[] = []
const client = new LastFmClient({
  apiKey: 'benchmark-key',
  fetchImpl: async (input) => {
    await delay(3)
    const url =
      input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
    const method = url.searchParams.get('method')
    if (method === 'album.getinfo') {
      return jsonResponse({
        album: {
          name: url.searchParams.get('album'),
          artist: url.searchParams.get('artist'),
          listeners: '1000',
          playcount: '2000',
          tags: { tag: [{ name: 'electronic' }] },
          image: [
            {
              '#text': 'https://images.example.test/lastfm-cover.jpg',
              size: 'extralarge'
            }
          ]
        }
      })
    }
    return jsonResponse({
      artist: {
        name: url.searchParams.get('artist'),
        listeners: '3000',
        tags: { tag: [{ name: 'electronic' }] }
      }
    })
  },
  musicBrainz: {
    async enrich(candidate) {
      await delay(40)
      return candidate
    }
  }
})

afterAll(async () => {
  await Promise.allSettled(pendingEnrichments)
})

describe('Last.fm foreground album hydration', () => {
  bench(
    'starts a playable album while optional deep metadata continues',
    async () => {
      const current = iteration
      iteration += 1
      const result = await client.hydrateForStart({
        kind: 'album',
        answer: `Benchmark Album ${current}`,
        artistName: `Benchmark Artist ${current}`,
        imageUrl: `https://images.example.test/cover-${current}.jpg`
      })
      if (result.status === 'deferred') pendingEnrichments.push(result.completion)
    },
    { time: 1_500, warmupIterations: 5, warmupTime: 100 }
  )
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
