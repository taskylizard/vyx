import { expect, test } from 'vite-plus/test'
import { DeezerClient } from '../../src/jumble/deezer.ts'

test('finds exact Deezer track artwork without credentials', async () => {
  let requestedUrl = ''
  const client = new DeezerClient({
    fetchImpl: async (input, init) => {
      requestedUrl =
        input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      return jsonResponse({
        data: [
          {
            id: 1_256_287_182,
            title: 'Cloudy Hollow',
            title_short: 'Cloudy Hollow',
            duration: 264,
            link: 'https://www.deezer.com/track/1256287182',
            artist: { id: 77_236_572, name: 'Pretty Patterns' },
            album: {
              id: 210_439_932,
              title: 'Cloudy Hollow',
              cover_xl:
                'https://cdn-images.dzcdn.net/images/cover/1872e378bd2ae9b69f2ea8df19c42306/1000x1000.jpg'
            }
          }
        ]
      })
    }
  })

  await expect(
    client.enrich({
      kind: 'track',
      answer: 'Cloudy Hollow',
      artistName: 'Pretty Patterns'
    })
  ).resolves.toMatchObject({
    albumName: 'Cloudy Hollow',
    durationMs: 264_000,
    imageUrl:
      'https://cdn-images.dzcdn.net/images/cover/1872e378bd2ae9b69f2ea8df19c42306/1000x1000.jpg'
  })
  expect(requestedUrl).toContain('/search/track?')
  expect(requestedUrl).toContain('Cloudy+Hollow+Pretty+Patterns')
})

test('chooses an exact album and artist instead of a high-ranked near match', async () => {
  const client = new DeezerClient({
    fetchImpl: async () =>
      jsonResponse({
        data: [
          {
            id: 2,
            title: 'Homogenic (Live)',
            cover_xl: 'https://images.example.test/live.jpg',
            artist: { id: 630, name: 'Björk' }
          },
          {
            id: 1,
            title: 'Homogenic',
            cover_xl: 'https://images.example.test/studio.jpg',
            artist: { id: 630, name: 'Björk' }
          },
          {
            id: 3,
            title: 'Homogenic',
            cover_xl: 'https://images.example.test/tribute.jpg',
            artist: { id: 999, name: 'Björk Tribute' }
          }
        ]
      })
  })

  await expect(
    client.enrich({ kind: 'album', answer: 'Homogenic', artistName: 'Björk' })
  ).resolves.toMatchObject({ imageUrl: 'https://images.example.test/studio.jpg' })
})

test('rejects unrelated Deezer results and placeholder artwork', async () => {
  const client = new DeezerClient({
    fetchImpl: async () =>
      jsonResponse({
        data: [
          {
            id: 1,
            name: 'Björk Tribute',
            picture_xl: 'https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg'
          }
        ]
      })
  })
  const candidate = { kind: 'artist', answer: 'Björk' } as const

  await expect(client.enrich(candidate)).resolves.toEqual(candidate)
})

test('does not negative-cache an unavailable Deezer lookup', async () => {
  const writes: unknown[] = []
  const client = new DeezerClient({
    cache: {
      async get() {
        return null
      },
      async set(cacheKey, value, ttlMs) {
        writes.push({ cacheKey, ttlMs, value })
        return true
      }
    },
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  })

  await expect(
    client.enrich({ kind: 'track', answer: 'Cloudy Hollow', artistName: 'Pretty Patterns' })
  ).resolves.toEqual({
    kind: 'track',
    answer: 'Cloudy Hollow',
    artistName: 'Pretty Patterns'
  })
  expect(writes).toEqual([])
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
