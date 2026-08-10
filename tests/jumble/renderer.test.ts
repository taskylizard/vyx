import { createCanvas, loadImage } from '@napi-rs/canvas'
import { expect, test } from 'vite-plus/test'
import { JumbleImageError, JumbleImageRenderer, pixelate } from '../../src/jumble/renderer.ts'
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
    [
      '',
      ' https://example.test/missing.png ',
      'https://example.test/missing.png',
      'https://example.test/fallback.png'
    ],
    0
  )

  expect(rendered.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(fetched).toEqual(['https://example.test/missing.png', 'https://example.test/fallback.png'])
})

test('does not start a fallback when preferred artwork renders within its head start', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 20,
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      return new Response(sourceBuffer, { status: 200 })
    },
    size: 32
  })

  await renderer.renderWithFallback([
    'https://example.test/preferred.png',
    'https://example.test/fallback.png'
  ])
  await delay(30)

  expect(fetched).toEqual(['https://example.test/preferred.png'])
})

test('starts fallback artwork immediately when the preferred source fails quickly', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 1_000,
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      return url.endsWith('/preferred.png')
        ? new Response('missing', { status: 404 })
        : new Response(sourceBuffer, { status: 200 })
    },
    size: 32
  })

  await renderer.renderWithFallback([
    'https://example.test/preferred.png',
    'https://example.test/fallback.png'
  ])

  expect(fetched).toEqual([
    'https://example.test/preferred.png',
    'https://example.test/fallback.png'
  ])
}, 500)

test('hedges a slow preferred artwork source after a bounded head start', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  let unblockPreferred!: () => void
  const preferredBlocked = new Promise<void>((resolve) => {
    unblockPreferred = resolve
  })
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 20,
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      if (url.endsWith('/preferred.png')) await preferredBlocked
      return new Response(sourceBuffer, { status: 200 })
    },
    size: 32
  })

  const render = renderer.renderWithFallback([
    'https://example.test/preferred.png',
    'https://example.test/fallback.png'
  ])
  const rendered = await Promise.race([render, delay(100).then(() => null)])
  unblockPreferred()
  await render

  expect(rendered).toBeInstanceOf(Buffer)
  expect(fetched).toEqual([
    'https://example.test/preferred.png',
    'https://example.test/fallback.png'
  ])
})

test('aborts the losing slow artwork download after fallback succeeds', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  let aborted = false
  let active = 0
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 10,
    fetchImpl: async (input, init) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      if (!url.endsWith('/preferred.png')) return new Response(sourceBuffer, { status: 200 })

      active += 1
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined
        const onAbort = (): void => {
          clearTimeout(timer)
          active -= 1
          aborted = true
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          active -= 1
          resolve(new Response('missing', { status: 404 }))
        }, 500)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
    size: 32
  })

  await expect(
    renderer.renderWithFallback([
      'https://example.test/preferred.png',
      'https://example.test/fallback.png'
    ])
  ).resolves.toBeInstanceOf(Buffer)
  await delay(20)

  expect(aborted).toBe(true)
  expect(active).toBe(0)
})

test('does not abort a shared artwork download while another render still needs it', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  let sharedFetches = 0
  let sharedAborts = 0
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 10,
    fetchImpl: async (input, init) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      if (!url.endsWith('/shared.png')) return new Response(sourceBuffer, { status: 200 })

      sharedFetches += 1
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined
        const onAbort = (): void => {
          clearTimeout(timer)
          sharedAborts += 1
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve(new Response(sourceBuffer, { status: 200 }))
        }, 80)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
    maxConcurrentRenders: 3,
    size: 32
  })

  const direct = renderer.render('https://example.test/shared.png')
  const fallback = renderer.renderWithFallback([
    'https://example.test/shared.png',
    'https://example.test/fallback.png'
  ])

  await expect(Promise.all([direct, fallback])).resolves.toHaveLength(2)
  expect(sharedFetches).toBe(1)
  expect(sharedAborts).toBe(0)
})

test('reports artwork download timeouts distinctly', async () => {
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true }
        )
      }),
    timeoutMs: 10
  })

  await expect(renderer.render('https://example.test/slow.png')).rejects.toThrow(
    'took too long to download'
  )
})

test('moves past stalled fallback sources after the per-source deadline', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  let aborted = 0
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 5,
    fallbackTimeoutMs: 20,
    fetchImpl: async (input, init) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      if (url.endsWith('/available.png')) return new Response(sourceBuffer, { status: 200 })

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted += 1
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          },
          { once: true }
        )
      })
    },
    size: 32,
    timeoutMs: 500
  })

  await expect(
    Promise.race([
      renderer.renderWithFallback([
        'https://example.test/stalled-large.png',
        'https://example.test/stalled-medium.png',
        'https://example.test/available.png'
      ]),
      delay(150).then(() => null)
    ])
  ).resolves.toBeInstanceOf(Buffer)
  expect(fetched).toEqual([
    'https://example.test/stalled-large.png',
    'https://example.test/stalled-medium.png',
    'https://example.test/available.png'
  ])
  expect(aborted).toBe(2)
})

test('keeps artwork fallback attempts to two active downloads', async () => {
  let active = 0
  let maxActive = 0
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 0,
    fetchImpl: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(20)
      active -= 1
      return new Response('missing', { status: 404 })
    }
  })

  await expect(
    renderer.renderWithFallback(
      Array.from({ length: 8 }, (_, index) => `https://example.test/${index}.png`)
    )
  ).rejects.toThrow('HTTP 404')
  expect(maxActive).toBe(2)
})

test('falls back from malformed artwork URLs to Unicode URLs', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      return new Response(sourceBuffer, { status: 200 })
    },
    size: 32
  })

  await expect(
    renderer.renderWithFallback(['not a URL', 'https://example.test/音楽.png'])
  ).resolves.toBeInstanceOf(Buffer)
  expect(fetched).toEqual(['https://example.test/%E9%9F%B3%E6%A5%BD.png'])
})

test('falls back when artwork announces an oversized response', async () => {
  const source = createCanvas(8, 8)
  source.getContext('2d').fillRect(0, 0, 8, 8)
  const sourceBuffer = source.toBuffer('image/png')
  const fetched: string[] = []
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      fetched.push(url)
      return url.endsWith('/oversized.png')
        ? new Response('oversized', {
            status: 200,
            headers: { 'content-length': String(32 * 1024), 'content-type': 'image/png' }
          })
        : new Response(sourceBuffer, { status: 200 })
    },
    maxBytes: 16 * 1024,
    size: 32
  })

  await expect(
    renderer.renderWithFallback([
      'https://example.test/oversized.png',
      'https://example.test/fallback.png'
    ])
  ).resolves.toBeInstanceOf(Buffer)
  expect(fetched).toEqual([
    'https://example.test/oversized.png',
    'https://example.test/fallback.png'
  ])
})

test('rejects empty artwork fallback lists without issuing a request', async () => {
  let fetches = 0
  const renderer = new JumbleImageRenderer({
    fetchImpl: async () => {
      fetches += 1
      return new Response('unexpected', { status: 500 })
    }
  })

  await expect(renderer.renderWithFallback(['', '   '])).rejects.toThrow(
    'did not return usable cover art'
  )
  expect(fetches).toBe(0)
})

test('fuzzes hostile artwork lists without exceeding fallback resource bounds', async () => {
  const corpus = [
    '',
    '   ',
    'not a URL',
    'ftp://example.test/cover.png',
    'data:image/png;base64,AAAA',
    'https://example.test/音楽.png',
    'https://example.test/repeated.png',
    ' https://example.test/repeated.png ',
    'https://example.test/%E9%9F%B3%E6%A5%BD.png',
    'https://example.test/oversized.png'
  ]

  await Promise.all(
    Array.from({ length: 64 }, async (_, caseIndex) => {
      const urls = Array.from(
        { length: (caseIndex * 17) % 24 },
        (_, urlIndex) => corpus[(caseIndex * 7 + urlIndex * 11) % corpus.length]
      )
      let active = 0
      let maxActive = 0
      let fetches = 0
      const renderer = new JumbleImageRenderer({
        fallbackHedgeMs: 0,
        fetchImpl: async () => {
          active += 1
          fetches += 1
          maxActive = Math.max(maxActive, active)
          await delay(1)
          active -= 1
          return new Response('missing', { status: 404 })
        }
      })

      await expect(renderer.renderWithFallback(urls)).rejects.toBeInstanceOf(JumbleImageError)
      expect(fetches).toBeLessThanOrEqual(8)
      expect(maxActive).toBeLessThanOrEqual(2)
    })
  )
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
