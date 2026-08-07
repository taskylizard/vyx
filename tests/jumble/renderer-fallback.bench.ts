import { createCanvas } from '@napi-rs/canvas'
import { bench, describe } from 'vite-plus/test'
import { JumbleImageRenderer } from '../../src/jumble/renderer.ts'

const source = createCanvas(8, 8)
source.getContext('2d').fillRect(0, 0, 8, 8)
const sourceBuffer = source.toBuffer('image/png')

describe('Jumble artwork fallback', () => {
  bench(
    'recovers when the preferred artwork source is slow and invalid',
    recoverSlowInvalidFallback,
    { time: 1_500, warmupIterations: 1, warmupTime: 0 }
  )

  bench('settles the losing slow source after fallback succeeds', settleSlowLoser, {
    time: 1_500,
    warmupIterations: 1,
    warmupTime: 0
  })

  bench('moves past stalled large Last.fm variants', movePastStalledVariants, {
    time: 1_500,
    warmupIterations: 1,
    warmupTime: 0
  })
})

async function recoverSlowInvalidFallback(): Promise<void> {
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (input) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
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
}

async function settleSlowLoser(): Promise<void> {
  let finishSlow!: () => void
  const slowSettled = new Promise<void>((resolve) => {
    finishSlow = resolve
  })
  const renderer = new JumbleImageRenderer({
    fetchImpl: async (input, init) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      if (!url.endsWith('/slow.png')) return new Response(sourceBuffer, { status: 200 })

      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined
        const onAbort = (): void => {
          clearTimeout(timer)
          finishSlow()
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          finishSlow()
          resolve(new Response('missing', { status: 404 }))
        }, 400)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
    size: 32
  })

  await renderer.renderWithFallback([
    'https://example.test/slow.png',
    'https://example.test/fallback.png'
  ])
  await slowSettled
}

async function movePastStalledVariants(): Promise<void> {
  const renderer = new JumbleImageRenderer({
    fallbackHedgeMs: 20,
    fallbackTimeoutMs: 300,
    fetchImpl: stalledVariantFetch,
    size: 32,
    timeoutMs: 800
  })

  await renderer.renderWithFallback([
    'https://example.test/large.png',
    'https://example.test/medium.png',
    'https://example.test/small.png',
    'https://example.test/tiny.png'
  ])
}

async function stalledVariantFetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
  const delayMs = url.endsWith('/large.png')
    ? 800
    : url.endsWith('/medium.png')
      ? 590
      : url.endsWith('/small.png')
        ? 260
        : 800
  return new Promise<Response>((resolve, reject) => {
    const signal = init?.signal ?? undefined
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(
        url.endsWith('/medium.png')
          ? new Response('missing', { status: 404 })
          : new Response(sourceBuffer, { status: 200 })
      )
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
