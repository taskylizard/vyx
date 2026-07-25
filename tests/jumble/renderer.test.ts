import { createCanvas, loadImage } from '@napi-rs/canvas'
import { expect, test } from 'vite-plus/test'
import { JumbleImageRenderer, pixelate } from '../../src/jumble/renderer.ts'

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
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => {
      fetches += 1
      return new Response(sourceBuffer, {
        status: 200,
        headers: { 'content-length': String(sourceBuffer.length) }
      })
    },
    size: 32
  })
  const first = await renderer.render('https://example.test/cover.png', 0)
  const second = await renderer.render('https://example.test/cover.png', 6)
  expect(first.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(second.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(fetches).toBe(1)
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

async function imageData(imageBuffer: Buffer): Promise<Uint8ClampedArray> {
  const image = await loadImage(imageBuffer)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height).data
}
