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
