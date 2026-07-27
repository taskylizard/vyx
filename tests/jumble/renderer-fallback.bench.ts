import { createCanvas } from '@napi-rs/canvas'
import { bench, describe } from 'vite-plus/test'
import { JumbleImageRenderer } from '../../src/jumble/renderer.ts'

const source = createCanvas(8, 8)
source.getContext('2d').fillRect(0, 0, 8, 8)
const sourceBuffer = source.toBuffer('image/png')

describe('Jumble artwork fallback', () => {
  bench(
    'recovers when the preferred artwork source is slow and invalid',
    async () => {
      const renderer = new JumbleImageRenderer({
        fetchImpl: async (input) => {
          const url =
            input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
          if (url.endsWith('/slow.png')) {
            await delay(400)
            return new Response('missing', { status: 404 })
          }
          return new Response(sourceBuffer, { status: 200 })
        },
        size: 32
      })

      await renderer.renderWithFallback([
        'https://example.test/slow.png',
        'https://example.test/fallback.png'
      ])
    },
    { time: 1_500, warmupIterations: 1, warmupTime: 0 }
  )
})

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
