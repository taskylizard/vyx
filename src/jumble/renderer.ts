import { createCanvas, loadImage } from '@napi-rs/canvas'
import { match, P } from 'ts-pattern'
import { clamp } from './numbers.ts'
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
  constructor(message: string) {
    super(message)
    this.name = 'JumbleImageError'
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
  onTiming?: JumbleTimingSink
}

interface CachedImage {
  buffer: Buffer
  bytes: number
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
  private readonly cache = new Map<string, CachedImage>()
  private cacheSize = 0
  private readonly inflightSources = new Map<string, Promise<Buffer>>()
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
    this.renderGate = new AsyncGate(
      clamp(Math.trunc(options.maxConcurrentRenders ?? 2), 1, 8),
      clamp(Math.trunc(options.maxPendingRenders ?? 16), 0, 64)
    )
    this.onTiming = options.onTiming
  }

  async render(url: string, stage = 0): Promise<Buffer> {
    const normalizedStage = clamp(Math.trunc(stage), 0, PIXELATION_LEVELS.length - 1)
    const level = PIXELATION_LEVELS[normalizedStage]!
    return this.measureRender('pixelated', 1, normalizedStage, () => this.renderImage(url, level))
  }

  async renderWithFallback(urls: readonly string[], stage = 0): Promise<Buffer> {
    const normalizedStage = clamp(Math.trunc(stage), 0, PIXELATION_LEVELS.length - 1)
    const level = PIXELATION_LEVELS[normalizedStage]!
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

  private async renderImage(url: string, pixelationLevel?: number): Promise<Buffer> {
    const release = await this.renderGate.acquire()
    if (release === null) throw new JumbleImageError('The cover art renderer is busy.')
    try {
      const source = await this.getSource(url)
      const image = await loadImage(source)
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
    let lastError: JumbleImageError | undefined
    for (const url of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop -- tasky: sequential fallback, tries URLs one at a time until a renderable one is found
        return await this.renderImage(url, pixelationLevel)
      } catch (error) {
        lastError =
          error instanceof JumbleImageError
            ? error
            : new JumbleImageError('Cover art could not be rendered.')
      }
    }
    throw lastError ?? new JumbleImageError('Cover art could not be rendered.')
  }

  private async getSource(url: string): Promise<Buffer> {
    const cached = this.cache.get(url)
    if (cached !== undefined) {
      this.cache.delete(url)
      this.cache.set(url, cached)
      return cached.buffer
    }

    const existing = this.inflightSources.get(url)
    if (existing !== undefined) return existing

    const task = this.downloadSource(url)
    this.inflightSources.set(url, task)
    try {
      return await task
    } finally {
      this.inflightSources.delete(url)
    }
  }

  private async downloadSource(url: string): Promise<Buffer> {
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
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(parsed, { signal: controller.signal })
      if (!response.ok) throw new JumbleImageError(`Cover art returned HTTP ${response.status}.`)
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
          (value): value is Error =>
            value instanceof Error && value.message.includes('safety limit'),
          () => new JumbleImageError('Cover art is too large to process.')
        )
        .when(
          (value): value is DOMException =>
            value instanceof DOMException && value.name === 'AbortError',
          () => new JumbleImageError('Cover art took too long to download.')
        )
        .otherwise(() => new JumbleImageError('Cover art could not be downloaded.'))
    } finally {
      clearTimeout(timer)
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
  return [...new Set(urls.map((url) => url.trim()).filter((url) => url.length > 0))].slice(0, 8)
}

class AsyncGate {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(
    private readonly limit: number,
    private readonly maxPending: number
  ) {}

  async acquire(): Promise<(() => void) | null> {
    if (this.active >= this.limit) {
      if (this.waiters.length >= this.maxPending) return null
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.waiters.shift()?.()
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
          red += data[offset]!
          green += data[offset + 1]!
          blue += data[offset + 2]!
          alpha += data[offset + 3]!
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
