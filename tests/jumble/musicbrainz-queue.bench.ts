import { bench, describe } from 'vite-plus/test'
import { MusicBrainzClient } from '../../src/jumble/musicbrainz.ts'

const options = {
  fetchImpl: async () => jsonResponse({ artists: [] }),
  maxQueueWaitMs: 500,
  minIntervalMs: 250
}

describe('MusicBrainz request queue', () => {
  bench(
    'bounds latency for a burst of unique lookups',
    async () => {
      const client = new MusicBrainzClient(options)
      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          client.enrich({ kind: 'artist', answer: `Unique Artist ${index}` })
        )
      )
    },
    { iterations: 1, warmupIterations: 0, warmupTime: 0 }
  )
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
