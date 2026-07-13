import { createServer } from 'node:http'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { startAxiomObservability } from '../../src/observability/axiom.ts'

test('exports AI SDK model traces to Axiom', async () => {
  const requests: Array<{ body: Buffer; headers: Record<string, string | string[] | undefined> }> =
    []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({ body: Buffer.concat(chunks), headers: request.headers })
      response.writeHead(200).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new Error('Missing test server port.')

    const observability = startAxiomObservability({
      AXIOM_DATASET: 'kanikou-test',
      AXIOM_TOKEN: 'axiom-test-token',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${address.port}/v1/traces`,
      OTEL_SERVICE_NAME: 'kanikou-test'
    })
    const modelFetch = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            message: { content: 'A traced response.', role: 'assistant' }
          }
        ],
        created: 1,
        id: 'chatcmpl-axiom-test',
        model: 'google/gemini-3-flash-preview',
        object: 'chat.completion',
        usage: { completion_tokens: 4, prompt_tokens: 8, total_tokens: 12 }
      })
    )
    const openrouter = createOpenRouter({ apiKey: 'openrouter-key', fetch: modelFetch })

    const result = await generateText({
      model: openrouter.chat('google/gemini-3-flash-preview'),
      prompt: 'Return a traced response.',
      telemetry: { functionId: 'kanikou.axiom-test' }
    })
    await observability.shutdown()

    expect(result.text).toBe('A traced response.')
    expect(requests.length).toBeGreaterThan(0)
    for (const request of requests) {
      expect(request.headers.authorization).toBe('Bearer axiom-test-token')
      expect(request.headers['x-axiom-dataset']).toBe('kanikou-test')
      expect(request.headers['content-type']).toContain('application/json')
      expect(request.body.byteLength).toBeGreaterThan(0)
    }
    const exportedTraces = requests.map((request) => request.body.toString()).join('\n')
    expect(exportedTraces).toContain('kanikou-test')
    expect(exportedTraces).toContain('google/gemini-3-flash-preview')
    expect(exportedTraces).toContain('kanikou.axiom-test')
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    )
  }
})
