import { expect, test } from 'vite-plus/test'
import { LastFmClient } from '../../src/jumble/lastfm.ts'

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

  await expect(client.hydrate(candidates[0]!)).resolves.toMatchObject({
    albumName: '(((((ultraSOUND)))))',
    imageUrl: 'https://example.test/large.png',
    imageUrls: ['https://example.test/large.png', 'https://example.test/medium.png']
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}
