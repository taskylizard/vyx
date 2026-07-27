import { expect, test } from 'vite-plus/test'
import { answerMatchesAny } from '../../src/jumble/answer.ts'
import { DiscogsClient } from '../../src/jumble/discogs.ts'

test('enriches a punctuation-only track with a Discogs title alias and artwork', async () => {
  const calls: string[] = []
  const authorizations: Array<string | null> = []
  const client = new DiscogsClient({
    fetchImpl: async (input, init) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      calls.push(url.href)
      authorizations.push(new Headers(init?.headers).get('authorization'))
      if (url.pathname === '/database/search') {
        return jsonResponse({
          results: [
            {
              id: 35_690_602,
              type: 'release',
              title: 'The Neighbourhood (3) - (((((Ultrasound)))))',
              resource_url: 'https://api.discogs.test/releases/35690602'
            }
          ]
        })
      }
      return jsonResponse({
        id: 35_690_602,
        title: '(((((Ultrasound)))))',
        released: '2025-12-08',
        genres: ['Rock'],
        styles: ['Alternative Rock'],
        images: [{ uri: 'https://images.example.test/ultrasound.png' }],
        labels: [{ name: 'Warner Records' }],
        formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album'] }],
        tracklist: [{ title: 'Planet' }]
      })
    },
    minIntervalMs: 0
  })

  const enriched = await client.enrich({
    kind: 'track',
    answer: '))))',
    albumName: '(((((ultraSOUND)))))',
    artistName: 'The Neighbourhood'
  })

  expect(calls).toHaveLength(2)
  expect(authorizations).toEqual([null, null])
  expect(enriched).toMatchObject({
    imageUrl: 'https://images.example.test/ultrasound.png',
    label: 'Warner Records',
    releaseDate: '2025-12-08',
    tags: ['Rock', 'Alternative Rock']
  })
  expect(
    answerMatchesAny([enriched.answer, ...(enriched.answerVariants ?? [])], 'ultrasound')
  ).toBe(true)
})

test('uses a personal token without putting it in the Discogs URL', async () => {
  let requestedUrl = ''
  let authorization: string | null = null
  const client = new DiscogsClient({
    token: 'secret-token',
    fetchImpl: async (input, init) => {
      requestedUrl =
        input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      authorization = new Headers(init?.headers).get('authorization')
      return jsonResponse({ results: [] })
    },
    minIntervalMs: 0
  })

  await client.enrich({ kind: 'artist', answer: 'Björk' })

  expect(requestedUrl).not.toContain('secret-token')
  expect(authorization).toBe('Discogs token=secret-token')
})

test('rejects partial release-title matches before accepting aliases', async () => {
  let calls = 0
  const client = new DiscogsClient({
    fetchImpl: async () => {
      calls += 1
      return jsonResponse({
        results: [{ id: 1, type: 'release', title: 'Artist - Love Songs' }]
      })
    },
    minIntervalMs: 0
  })
  const candidate = { kind: 'album', answer: 'Love', artistName: 'Artist' } as const

  await expect(client.enrich(candidate)).resolves.toEqual(candidate)
  expect(calls).toBe(1)
})

test('does not negative-cache an unavailable Discogs lookup', async () => {
  const writes: unknown[] = []
  const client = new DiscogsClient({
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
  const candidate = { kind: 'album', answer: 'Homogenic', artistName: 'Björk' } as const

  await expect(client.enrich(candidate)).resolves.toEqual(candidate)
  expect(writes).toEqual([])
})

test('does not cache a reduced fallback after Discogs detail fails', async () => {
  const writes: unknown[] = []
  let calls = 0
  const client = new DiscogsClient({
    cache: {
      async get() {
        return null
      },
      async set(cacheKey, value, ttlMs) {
        writes.push({ cacheKey, ttlMs, value })
        return true
      }
    },
    fetchImpl: async () => {
      calls += 1
      return calls === 1
        ? jsonResponse({
            results: [
              {
                cover_image: 'https://images.example.test/homogenic.png',
                id: 1,
                title: 'Björk - Homogenic',
                type: 'release'
              }
            ]
          })
        : new Response('unavailable', { status: 503 })
    },
    minIntervalMs: 0
  })

  await expect(
    client.enrich({ kind: 'album', answer: 'Homogenic', artistName: 'Björk' })
  ).resolves.toMatchObject({ imageUrl: 'https://images.example.test/homogenic.png' })
  expect(writes).toEqual([])
})

test('does not treat an unrelated album title as a punctuation-only track alias', async () => {
  let calls = 0
  const client = new DiscogsClient({
    fetchImpl: async () => {
      calls += 1
      return calls === 1
        ? jsonResponse({
            results: [{ id: 1, title: 'Artist - Album', type: 'release' }]
          })
        : jsonResponse({
            id: 1,
            released: '2025',
            title: 'Album',
            tracklist: [{ title: 'Song' }]
          })
    },
    minIntervalMs: 0
  })

  const enriched = await client.enrich({
    kind: 'track',
    albumName: 'Album',
    answer: '....',
    artistName: 'Artist'
  })

  expect(answerMatchesAny([enriched.answer, ...(enriched.answerVariants ?? [])], 'Album')).toBe(
    false
  )
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
