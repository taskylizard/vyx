import { createServer } from 'node:http'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { startAxiomObservability } from '../../src/observability/axiom.ts'
import { traceOperation } from '../../src/observability/tracing.ts'

interface ExportRequest {
  body: Buffer
  headers: Record<string, string | string[] | undefined>
  path: string
}

test('exports correlated logs, errors, and AI traces to separate Axiom datasets', async () => {
  const requests: ExportRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        body: Buffer.concat(chunks),
        headers: request.headers,
        path: request.url ?? ''
      })
      response.writeHead(200).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing test server port.')
    }

    const observability = startAxiomObservability({
      endpoint: `http://127.0.0.1:${address.port}/otel/v1/traces`,
      kind: 'axiom',
      level: 'TRACE',
      logsDataset: 'kanikou-logs-test',
      metricsDataset: 'kanikou-metrics-test',
      serviceName: 'kanikou-test',
      serviceVersion: '0123456789abcdef0123456789abcdef01234567',
      token: 'axiom-test-token',
      tracesDataset: 'kanikou-traces-test'
    })
    const modelFetch = createModelFetch()
    const openrouter = createOpenRouter({ apiKey: 'openrouter-key', fetch: modelFetch })

    const result = await traceOperation(
      'test.axiom',
      { attributes: { testCase: 'correlation' }, parent: 'root' },
      async () => {
        observability.logger.error('stored test error', {
          error: new Error('axiom stored error https://example.test/fail?token=error-secret'),
          inputTokens: 42,
          token: 'must-not-leak'
        })
        return generateText({
          model: openrouter.chat('google/gemini-3-flash-preview'),
          prompt: 'telemetry-input-secret',
          telemetry: {
            functionId: 'kanikou.axiom-test',
            recordInputs: false,
            recordOutputs: false
          }
        })
      }
    )
    await new Promise((resolve) => setTimeout(resolve, 120))
    await observability.shutdown()

    expectTelemetryExports(requests, result.text)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    )
  }
})

function traceIds(payload: string): string[] {
  return [...payload.matchAll(/"traceId":"([a-f\d]{32})"/gu)].map((match) => match[1])
}

function expectTelemetryExports(requests: readonly ExportRequest[], resultText: string): void {
  expect(resultText).toBe('telemetry-output-secret')
  const logRequests = requests.filter((request) => request.path === '/otel/v1/logs')
  const metricRequests = requests.filter((request) => request.path === '/otel/v1/metrics')
  const traceRequests = requests.filter((request) => request.path === '/otel/v1/traces')
  expectSignalExport(logRequests, 'kanikou-logs-test', 'x-axiom-dataset', 'application/json')
  expectSignalExport(
    metricRequests,
    'kanikou-metrics-test',
    'x-axiom-metrics-dataset',
    'application/x-protobuf'
  )
  expectSignalExport(traceRequests, 'kanikou-traces-test', 'x-axiom-dataset', 'application/json')
  for (const request of metricRequests) {
    expect(request.headers['x-axiom-dataset']).toBeUndefined()
  }

  const exportedLogs = logRequests.map((request) => request.body.toString()).join('\n')
  const exportedMetrics = metricRequests.map((request) => request.body.toString()).join('\n')
  const exportedTraces = traceRequests.map((request) => request.body.toString()).join('\n')
  expect(exportedLogs).toContain('stored test error')
  expect(exportedLogs).toContain('axiom stored error')
  expect(exportedLogs).toContain('exception.stacktrace')
  expect(exportedLogs).toContain('inputTokens')
  expect(exportedLogs).toContain('[redacted]')
  expect(exportedLogs).not.toContain('error-secret')
  expect(exportedLogs).not.toContain('must-not-leak')
  expect(exportedTraces).toContain('google/gemini-3-flash-preview')
  expect(exportedTraces).toContain('kanikou.axiom-test')
  expect(exportedTraces).not.toContain('telemetry-input-secret')
  expect(exportedTraces).not.toContain('telemetry-output-secret')
  expect(exportedMetrics).toContain('nodejs.eventloop.utilization')
  expect(exportedMetrics).toContain('process.cpu.utilization')
  expect(exportedMetrics).toContain('process.memory.usage')
  expect(exportedMetrics).toContain('process.runtime.nodejs.memory.array_buffers')
  expect(exportedMetrics).toContain('process.runtime.nodejs.memory.external')
  expect(exportedMetrics).toContain('process.uptime')
  expect(exportedMetrics).toContain('0123456789abcdef0123456789abcdef01234567')

  const logTraceIds = traceIds(exportedLogs)
  const exportedTraceIds = traceIds(exportedTraces)
  expect(logTraceIds.some((traceId) => exportedTraceIds.includes(traceId))).toBe(true)
}

function expectSignalExport(
  requests: readonly ExportRequest[],
  dataset: string,
  datasetHeader: 'x-axiom-dataset' | 'x-axiom-metrics-dataset',
  contentType: 'application/json' | 'application/x-protobuf'
): void {
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    expect(request.headers.authorization).toBe('Bearer axiom-test-token')
    expect(request.headers[datasetHeader]).toBe(dataset)
    expect(request.headers['content-type']).toContain(contentType)
  }
}

function createModelFetch() {
  return vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          index: 0,
          message: { content: 'telemetry-output-secret', role: 'assistant' }
        }
      ],
      created: 1,
      id: 'chatcmpl-axiom-test',
      model: 'google/gemini-3-flash-preview',
      object: 'chat.completion',
      usage: { completion_tokens: 4, prompt_tokens: 8, total_tokens: 12 }
    })
  )
}
