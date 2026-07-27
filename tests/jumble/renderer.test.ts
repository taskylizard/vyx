import { createCanvas, loadImage } from '@napi-rs/canvas'
import { expect, test } from 'vite-plus/test'
import { JumbleImageRenderer, pixelate } from '../../src/jumble/renderer.ts'
import type { JumbleTimingEvent } from '../../src/jumble/timing.ts'

test('averages every pixel in a block', () => {
  const data = new Uint8ClampedArray(4 * 4 * 4)
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const offset = (y * 4 + x) * 4
      data[offset] = x < 2 ? 255 : 0
      data[offset + 1] = y < 2 ? 255 : 0
      data[offset + 2] = 0
      data[offset + 3] = 255
    }
  }
  pixelate(data, 4, 4, 2)
  expect(Array.from(data.slice(0, 4))).toEqual([255, 255, 0, 255])
  expect(Array.from(data.slice(8, 12))).toEqual([0, 255, 0, 255])
  expect(Array.from(data.slice(32, 36))).toEqual([255, 0, 0, 255])
})

test('downloads and renders a bounded cover with the fast napi canvas backend', async () => {
  const source = createCanvas(8, 8)
  const sourceContext = source.getContext('2d')
  sourceContext.fillStyle = '#ff0000'
  sourceContext.fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  let fetches = 0
  const timing: JumbleTimingEvent[] = []
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => {
      fetches += 1
      return new Response(sourceBuffer, {
        status: 200,
        headers: { 'content-length': String(sourceBuffer.length) }
      })
    },
    onTiming: (event) => timing.push(event),
    size: 32
  })
  const first = await renderer.render('https://example.test/cover.png', 0)
  const second = await renderer.render('https://example.test/cover.png', 6)
  expect(first.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(second.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(fetches).toBe(1)
  expect(timing).toEqual([
    expect.objectContaining({
      type: 'render',
      mode: 'pixelated',
      outcome: 'success',
      sourceCount: 1,
      stage: 0
    }),
    expect.objectContaining({
      type: 'render',
      mode: 'pixelated',
      outcome: 'success',
      sourceCount: 1,
      stage: 6
    })
  ])
})

test('reveals the unpixelated cover when a game ends', async () => {
  const source = createCanvas(32, 32)
  const sourceContext = source.getContext('2d')
  for (let x = 0; x < 32; x += 1) {
    sourceContext.fillStyle = `rgb(${x * 8}, 0, 0)`
    sourceContext.fillRect(x, 0, 1, 32)
  }
  const sourceBuffer = source.toBuffer('image/png')
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => new Response(sourceBuffer, { status: 200 }),
    size: 32
  })

  const pixelated = await imageData(await renderer.render('https://example.test/gradient.png'))
  const revealed = await imageData(await renderer.reveal('https://example.test/gradient.png'))
  expect(pixelated[0]).toBe(pixelated[4])
  expect(revealed[0]).not.toBe(revealed[4])
})

test('falls back through bounded artwork sources after a failed URL', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      return url.endsWith('/missing.png')
        ? new Response('missing', { status: 404 })
        : new Response(sourceBuffer, { status: 200 })
    },
    size: 32
  })

  const rendered = await renderer.renderWithFallback(
    ['https://example.test/missing.png', 'https://example.test/fallback.png'],
    0
  )

  expect(rendered.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(fetched).toEqual(['https://example.test/missing.png', 'https://example.test/fallback.png'])
})

test('attempts at most eight artwork fallbacks', async () => {
  let fetches = 0
  const timing: JumbleTimingEvent[] = []
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => {
      fetches += 1
      return new Response('missing', { status: 404 })
    },
    onTiming: (event) => timing.push(event)
  })

  await expect(
    renderer.renderWithFallback(
      Array.from({ length: 64 }, (_, index) => `https://example.test/${index}.png`)
    )
  ).rejects.toThrow('HTTP 404')
  expect(fetches).toBe(8)
  expect(timing).toEqual([
    expect.objectContaining({
      type: 'render',
      mode: 'pixelated',
      outcome: 'failed',
      sourceCount: 8
    })
  ])
})

test('bounds queued downloads and renders', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  let unblock!: () => void
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => {
      await blocked
      return new Response(sourceBuffer, { status: 200 })
    },
    maxConcurrentRenders: 1,
    maxPendingRenders: 1,
    size: 32
  })

  const active = renderer.render('https://example.test/active.png')
  const queued = renderer.render('https://example.test/queued.png')
  await expect(renderer.render('https://example.test/rejected.png')).rejects.toThrow(
    'renderer is busy'
  )

  unblock()
  await expect(Promise.all([active, queued])).resolves.toHaveLength(2)
})

async function imageData(imageBuffer: Buffer): Promise<Uint8ClampedArray> {
  const image = await loadImage(imageBuffer)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height).data
}
