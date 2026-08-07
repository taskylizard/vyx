import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, expect, test } from 'vite-plus/test'
import { LastFmClient } from '../../src/jumble/lastfm.ts'
import { runDetached } from '../../src/observability/tracing.ts'

const sdk = new NodeSDK({
  instrumentations: [],
  metricReaders: [],
  spanProcessors: [new NoopSpanProcessor()]
})

beforeAll(() => sdk.start())
afterAll(() => sdk.shutdown())

test('runs synchronous and asynchronous background work without the active span', async () => {
  const parent = trace.wrapSpanContext({
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1
  })
  const parentContext = trace.setSpan(ROOT_CONTEXT, parent)

  await context.with(parentContext, async () => {
    expect(trace.getActiveSpan()).toBe(parent)
    expect(runDetached(() => trace.getActiveSpan())).toBeUndefined()

    const asynchronousSpan = await runDetached(
      () => new Promise((resolve) => setTimeout(() => resolve(trace.getActiveSpan()), 0))
    )
    expect(asynchronousSpan).toBeUndefined()
  })
})

test('detaches deferred Last.fm enrichment from the foreground span', async () => {
  const parent = trace.wrapSpanContext({
    traceId: 'fedcba9876543210fedcba9876543210',
    spanId: 'fedcba9876543210',
    traceFlags: 1
  })
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let observedSpan = trace.getActiveSpan()
  const client = new LastFmClient({
    apiKey: 'test-key',
    fetchImpl: async (input) => {
      const method = new URL(
        input instanceof URL ? input : typeof input === 'string' ? input : input.url
      ).searchParams.get('method')
      return method === 'album.getinfo'
        ? Response.json({
            album: {
              name: 'Detached Album',
              artist: 'Detached Artist',
              image: [{ '#text': 'https://example.test/cover.png', size: 'extralarge' }]
            }
          })
        : Response.json({ artist: { name: 'Detached Artist' } })
    },
    musicBrainz: {
      async enrich(candidate) {
        observedSpan = trace.getActiveSpan()
        await blocked
        return candidate
      }
    }
  })

  const result = await context.with(trace.setSpan(ROOT_CONTEXT, parent), () =>
    client.hydrateForStart({
      kind: 'album',
      answer: 'Detached Album',
      artistName: 'Detached Artist',
      imageUrl: 'https://example.test/top-list.png'
    })
  )
  expect(result.status).toBe('deferred')
  expect(observedSpan).toBeDefined()
  expect(observedSpan?.spanContext().traceId).not.toBe(parent.spanContext().traceId)

  release()
  if (result.status === 'deferred') await result.completion
})
