import { createCanvas, loadImage } from '@napi-rs/canvas'
import { clamp, unique } from 'radashi'
import { match, P } from 'ts-pattern'
import { readBoundedBytes } from './response.ts'
import {
  emitJumbleTiming,
  jumbleDurationMs,
  type JumbleTimingEvent,
  type JumbleTimingSink
} from './timing.ts'

/** Pixel block sizes used by Jumble, from hardest to clearest. */
export const PIXELATION_LEVELS = [0.125, 0.085, 0.05, 0.03, 0.02, 0.015, 0.01] as const

export class JumbleImageError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'JumbleImageError'
    this.status = status
  }
}

export interface JumbleImageRendererOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  size?: number
  cacheEntries?: number
  cacheBytes?: number
  maxConcurrentRenders?: number
  maxPendingRenders?: number
  fallbackHedgeMs?: number
  fallbackTimeoutMs?: number
  onTiming?: JumbleTimingSink
}

interface CachedImage {
  buffer: Buffer
  bytes: number
}

type RenderFallbackEvent =
  | { kind: 'rendered'; index: number; buffer: Buffer }
  | { kind: 'failed'; index: number; error: JumbleImageError }
  | { kind: 'hedge' }

interface InflightSource {
  controller: AbortController
  consumers: number
  promise: Promise<Buffer>
  settled: boolean
}

interface GateWaiter {
  onAbort?: () => void
  reject: (reason?: unknown) => void
  resolve: () => void
  signal?: AbortSignal
}

interface ActiveFallbackAttempt {
  controller: AbortController
  promise: Promise<RenderFallbackEvent>
  timeout: ReturnType<typeof setTimeout>
}

const MAX_SOURCE_BYTES = 32 * 1024 * 1024
const MAX_CACHE_BYTES = 128 * 1024 * 1024
const MAX_RENDER_SIZE = 2_048
const MAX_RENDER_PIXELS = 16_777_216

/** Fetches, bounds, caches, and pixelates cover art without node-canvas. */
export class JumbleImageRenderer {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly size: number
  private readonly cacheEntries: number
  private readonly cacheBytes: number
  private readonly fallbackHedgeMs: number
  private readonly fallbackTimeoutMs: number
  private readonly cache = new Map<string, CachedImage>()
  private cacheSize = 0
  private readonly inflightSources = new Map<string, InflightSource>()
  private readonly renderGate: AsyncGate
  private readonly onTiming?: JumbleTimingSink

  constructor(options: JumbleImageRendererOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 8_000
    this.maxBytes = clamp(
      Math.trunc(options.maxBytes ?? 8 * 1024 * 1024),
      16 * 1024,
      MAX_SOURCE_BYTES
    )
    this.size = clamp(Math.trunc(options.size ?? 512), 16, MAX_RENDER_SIZE)
    this.cacheEntries = clamp(Math.trunc(options.cacheEntries ?? 64), 1, 512)
    this.cacheBytes = clamp(
      Math.trunc(options.cacheBytes ?? 32 * 1024 * 1024),
      this.maxBytes,
      MAX_CACHE_BYTES
    )
    this.fallbackHedgeMs = clamp(Math.trunc(options.fallbackHedgeMs ?? 250), 0, 5_000)
    const fallbackTimeoutMinimum = Math.min(100, this.timeoutMs)
    this.fallbackTimeoutMs = clamp(
      Math.trunc(options.fallbackTimeoutMs ?? Math.min(this.timeoutMs, 3_000)),
      fallbackTimeoutMinimum,
      this.timeoutMs
    )
    this.renderGate = new AsyncGate(
      clamp(Math.trunc(options.maxConcurrentRenders ?? 2), 1, 8),
      clamp(Math.trunc(options.maxPendingRenders ?? 16), 0, 64)
    )
    this.onTiming = options.onTiming
  }

  async render(url: string, stage = 0): Promise<Buffer> {
    const normalizedStage = clamp(Math.trunc(stage), 0, PIXELATION_LEVELS.length - 1)
    const level = PIXELATION_LEVELS[normalizedStage]
    return this.measureRender('pixelated', 1, normalizedStage, () => this.renderImage(url, level))
  }

  async renderWithFallback(urls: readonly string[], stage = 0): Promise<Buffer> {
    const normalizedStage = clamp(Math.trunc(stage), 0, PIXELATION_LEVELS.length - 1)
    const level = PIXELATION_LEVELS[normalizedStage]
    const candidates = boundedArtworkUrls(urls)
    return this.measureRender('pixelated', candidates.length, normalizedStage, () =>
      this.renderFirstAvailable(candidates, level)
    )
  }

  async reveal(url: string): Promise<Buffer> {
    return this.measureRender('revealed', 1, 0, () => this.renderImage(url))
  }

  async revealWithFallback(urls: readonly string[]): Promise<Buffer> {
    const candidates = boundedArtworkUrls(urls)
    return this.measureRender('revealed', candidates.length, 0, () =>
      this.renderFirstAvailable(candidates)
    )
  }

  private async measureRender(
    mode: 'pixelated' | 'revealed',
    sourceCount: number,
    stage: number,
    task: () => Promise<Buffer>
  ): Promise<Buffer> {
    const startedAt = performance.now()
    let outcome: 'success' | 'failed' = 'failed'
    try {
      const rendered = await task()
      outcome = 'success'
      return rendered
    } finally {
      const common = {
        type: 'render' as const,
        outcome,
        durationMs: jumbleDurationMs(startedAt),
        sourceCount
      }
      emitJumbleTiming(
        this.onTiming,
        match(mode)
          .returnType<JumbleTimingEvent>()
          .with('pixelated', () => ({ ...common, mode: 'pixelated', stage }))
          .with('revealed', () => ({ ...common, mode: 'revealed' }))
          .exhaustive()
      )
    }
  }

  private async renderImage(
    url: string,
    pixelationLevel?: number,
    signal?: AbortSignal
  ): Promise<Buffer> {
    const release = await this.renderGate.acquire(signal)
    if (release === null) throw new JumbleImageError('The cover art renderer is busy.')
    try {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      const source = await this.getSource(url, signal)
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      const image = await loadImage(source)
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      if (
        !Number.isFinite(image.width) ||
        !Number.isFinite(image.height) ||
        image.width < 1 ||
        image.height < 1 ||
        image.width * image.height > MAX_RENDER_PIXELS
      ) {
        throw new JumbleImageError('Cover art has unsafe dimensions.')
      }
      const canvas = createCanvas(this.size, this.size)
      const context = canvas.getContext('2d')
      context.imageSmoothingEnabled = true
      context.fillStyle = '#111111'
      context.fillRect(0, 0, this.size, this.size)

      const scale = Math.max(this.size / image.width, this.size / image.height)
      const width = image.width * scale
      const height = image.height * scale
      context.drawImage(image, (this.size - width) / 2, (this.size - height) / 2, width, height)

      const pixels = context.getImageData(0, 0, this.size, this.size)
      const blockSize =
        pixelationLevel === undefined ? 1 : Math.max(1, Math.floor(this.size * pixelationLevel))
      if (blockSize > 1) pixelate(pixels.data, this.size, this.size, blockSize)
      context.putImageData(pixels, 0, 0)
      return canvas.toBuffer('image/png')
    } finally {
      release()
    }
  }

  clear(): void {
    this.cache.clear()
    this.cacheSize = 0
  }

  private async renderFirstAvailable(
    candidates: readonly string[],
    pixelationLevel?: number
  ): Promise<Buffer> {
    if (candidates.length === 0) {
      throw new JumbleImageError('The music service did not return usable cover art.')
    }
    const active = new Map<number, ActiveFallbackAttempt>()
    let nextIndex = 0
    let lastError: JumbleImageError | undefined
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined
    let hedge: Promise<RenderFallbackEvent> | undefined

    const cancelHedge = (): void => {
      if (hedgeTimer !== undefined) clearTimeout(hedgeTimer)
      hedgeTimer = undefined
      hedge = undefined
    }

    const cancelLosingAttempts = (winnerIndex: number): void => {
      for (const [index, attempt] of active) {
        if (index === winnerIndex) continue
        clearTimeout(attempt.timeout)
        attempt.controller.abort()
      }
    }

    const startNext = (): void => {
      const index = nextIndex
      const url = candidates[index]
      nextIndex += 1

      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(new DOMException('The fallback source timed out.', 'TimeoutError')),
        this.fallbackTimeoutMs
      )
      const task = this.renderImage(url, pixelationLevel, controller.signal)
        .then(
          (buffer) => ({ kind: 'rendered', index, buffer }) as const,
          (error: unknown) =>
            ({
              kind: 'failed',
              index,
              error:
                error instanceof JumbleImageError
                  ? error
                  : new JumbleImageError('Cover art could not be rendered.')
            }) as const
        )
        .finally(() => clearTimeout(timeout))
      active.set(index, { controller, promise: task, timeout })
    }

    const scheduleHedge = (): void => {
      if (hedge !== undefined || active.size !== 1 || nextIndex >= candidates.length) return
      hedge = new Promise<RenderFallbackEvent>((resolve) => {
        hedgeTimer = setTimeout(() => {
          hedgeTimer = undefined
          resolve({ kind: 'hedge' })
        }, this.fallbackHedgeMs)
      })
    }

    startNext()
    scheduleHedge()
    while (active.size > 0) {
      const contenders = [...active.values()].map(({ promise }) => promise)
      if (hedge !== undefined) contenders.push(hedge)
      // eslint-disable-next-line no-await-in-loop -- tasky: each result decides whether the two-slot hedge can start another source
      const event = await Promise.race(contenders)
      const rendered = match(event)
        .returnType<Buffer | undefined>()
        .with({ kind: 'rendered' }, ({ index, buffer }) => {
          cancelHedge()
          cancelLosingAttempts(index)
          return buffer
        })
        .with({ kind: 'failed' }, ({ index, error }) => {
          active.delete(index)
          lastError = error
          cancelHedge()
          startNext()
          scheduleHedge()
          return undefined
        })
        .with({ kind: 'hedge' }, () => {
          hedge = undefined
          startNext()
          return undefined
        })
        .exhaustive()
      if (rendered !== undefined) return rendered
    }
    throw lastError ?? new JumbleImageError('Cover art could not be rendered.')
  }

  private async getSource(url: string, signal?: AbortSignal): Promise<Buffer> {
    const cached = this.cache.get(url)
    if (cached !== undefined) {
      this.cache.delete(url)
      this.cache.set(url, cached)
      return cached.buffer
    }

    const existing = this.inflightSources.get(url)
    if (existing !== undefined) return this.waitForSource(url, existing, signal)

    const controller = new AbortController()
    let request: InflightSource
    const task = this.downloadSource(url, controller.signal).then(
      (buffer) => {
        request.settled = true
        if (this.inflightSources.get(url) === request) this.inflightSources.delete(url)
        return buffer
      },
      (error: unknown) => {
        request.settled = true
        if (this.inflightSources.get(url) === request) this.inflightSources.delete(url)
        throw error
      }
    )
    request = { controller, consumers: 0, promise: task, settled: false }
    this.inflightSources.set(url, request)
    void task.catch(() => undefined)
    return this.waitForSource(url, request, signal)
  }

  private async waitForSource(
    url: string,
    request: InflightSource,
    signal?: AbortSignal
  ): Promise<Buffer> {
    request.consumers += 1
    let onAbort: (() => void) | undefined
    try {
      if (signal === undefined) return await request.promise
      if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
        signal.addEventListener('abort', onAbort, { once: true })
      })
      return await Promise.race([request.promise, aborted])
    } finally {
      if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort)
      request.consumers -= 1
      if (request.consumers === 0 && !request.settled) {
        request.controller.abort(signal?.reason)
        if (this.inflightSources.get(url) === request) this.inflightSources.delete(url)
      }
    }
  }

  private async downloadSource(url: string, signal: AbortSignal): Promise<Buffer> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new JumbleImageError('The music service returned an invalid cover URL.')
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new JumbleImageError('The music service returned an unsupported cover URL.')
    }

    const controller = new AbortController()
    let timedOut = false
    const abortDownload = (): void => controller.abort()
    if (signal.aborted) abortDownload()
    else signal.addEventListener('abort', abortDownload, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      abortDownload()
    }, this.timeoutMs)
    try {
      const response = await this.fetchImpl(parsed, { signal: controller.signal })
      if (!response.ok) {
        throw new JumbleImageError(`Cover art returned HTTP ${response.status}.`, response.status)
      }
      const contentType = response.headers.get('content-type')
      if (contentType !== null && !contentType.toLowerCase().startsWith('image/')) {
        throw new JumbleImageError('Cover art returned an unexpected file type.')
      }
      const announcedLength = Number(response.headers.get('content-length') ?? 0)
      if (announcedLength > this.maxBytes)
        throw new JumbleImageError('Cover art is too large to process.')
      const buffer = Buffer.from(await readBoundedBytes(response, this.maxBytes))
      if (buffer.length === 0 || buffer.length > this.maxBytes) {
        throw new JumbleImageError('Cover art is empty or too large to process.')
      }
      const previous = this.cache.get(url)
      if (previous !== undefined) this.cacheSize -= previous.bytes
      this.cache.set(url, { buffer, bytes: buffer.byteLength })
      this.cacheSize += buffer.byteLength
      this.trimCache()
      return buffer
    } catch (error) {
      throw match(error)
        .with(P.instanceOf(JumbleImageError), (value) => value)
        .when(
          () => timedOut,
          () => new JumbleImageError('Cover art took too long to download.')
        )
        .when(
          () => signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError',
          () => new JumbleImageError('Cover art took too long to download.')
        )
        .when(
          () => signal.aborted,
          () => new JumbleImageError('Cover art download was cancelled.')
        )
        .when(
          (value): value is Error =>
            value instanceof Error && value.message.includes('safety limit'),
          () => new JumbleImageError('Cover art is too large to process.')
        )
        .otherwise(() => new JumbleImageError('Cover art could not be downloaded.'))
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abortDownload)
    }
  }

  private trimCache(): void {
    while (this.cache.size > this.cacheEntries || this.cacheSize > this.cacheBytes) {
      const oldest = this.cache.entries().next()
      if (oldest.done) return
      this.cache.delete(oldest.value[0])
      this.cacheSize -= oldest.value[1].bytes
    }
  }
}

function boundedArtworkUrls(urls: readonly string[]): string[] {
  return unique(urls.map((url) => url.trim()).filter((url) => url.length > 0)).slice(0, 8)
}

class AsyncGate {
  private active = 0
  private readonly waiters: GateWaiter[] = []

  constructor(
    private readonly limit: number,
    private readonly maxPending: number
  ) {}

  async acquire(signal?: AbortSignal): Promise<(() => void) | null> {
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    if (this.active >= this.limit) {
      if (this.waiters.length >= this.maxPending) return null
      await new Promise<void>((resolve, reject) => {
        const waiter: GateWaiter = { reject, resolve, signal }
        if (signal !== undefined) {
          waiter.onAbort = () => {
            const index = this.waiters.indexOf(waiter)
            if (index >= 0) this.waiters.splice(index, 1)
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          }
          signal.addEventListener('abort', waiter.onAbort, { once: true })
        }
        this.waiters.push(waiter)
      })
    }
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      const waiter = this.waiters.shift()
      if (waiter === undefined) return
      if (waiter.onAbort !== undefined) {
        waiter.signal?.removeEventListener('abort', waiter.onAbort)
      }
      waiter.resolve()
    }
  }
}

/** Average each source block before writing the pixelated image. */
export function pixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number
): void {
  for (let top = 0; top < height; top += blockSize) {
    for (let left = 0; left < width; left += blockSize) {
      const right = Math.min(width, left + blockSize)
      const bottom = Math.min(height, top + blockSize)
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let count = 0
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * width + x) * 4
          red += data[offset]
          green += data[offset + 1]
          blue += data[offset + 2]
          alpha += data[offset + 3]
          count += 1
        }
      }
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * width + x) * 4
          data[offset] = Math.round(red / count)
          data[offset + 1] = Math.round(green / count)
          data[offset + 2] = Math.round(blue / count)
          data[offset + 3] = Math.round(alpha / count)
        }
      }
    }
  }
}
