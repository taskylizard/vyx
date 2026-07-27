import { bench, describe } from 'vite-plus/test'
import { MusicBrainzClient } from '../../src/jumble/musicbrainz.ts'

const releaseId = '12345678-1234-4234-8234-123456789abc'
const releaseGroupId = '87654321-4321-4321-8321-cba987654321'
let virtualNow = 0
const client = new MusicBrainzClient({
  fetchImpl: async (input) => {
    await delay(3)
    const url =
      input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
    if (url.pathname.endsWith('/artist/')) {
      return jsonResponse({ artists: [{ id: 'artist', name: 'Björk', country: 'IS' }] })
    }
    if (url.pathname.endsWith('/release-group/')) {
      return jsonResponse({
        'release-groups': [
          {
            id: releaseGroupId,
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
      'release-group': { id: releaseGroupId, title: 'Homogenic', 'primary-type': 'Album' }
    })
  },
  minIntervalMs: 250,
  now: () => {
    virtualNow += 250
    return virtualNow
  }
})

describe('MusicBrainz release enrichment', () => {
  bench(
    'enriches an album that already has Last.fm artist metadata',
    async () => {
      await client.enrich({
        kind: 'album',
        answer: 'Homogenic',
        artistName: 'Björk',
        artistMetadata: { summary: 'Existing Last.fm artist metadata.' }
      })
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
