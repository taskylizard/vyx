import { expect, test, vi } from 'vite-plus/test'
import { createParallelExtractTool } from '../../src/llm/tools/parallel-extract.ts'

test('uses the Parallel AI SDK package extract tool', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      errors: [],
      extract_id: 'extract-1',
      results: [
        {
          excerpts: ['Vite+ combines development, testing, and packaging behind vp.'],
          title: 'Vite+ Guide',
          url: 'https://viteplus.dev/guide/'
        }
      ],
      session_id: 'session-1'
    })
  )
  vi.stubGlobal('fetch', fetcher)

  try {
    const parallelExtractTool = createParallelExtractTool({ apiKey: 'parallel-key' })
    if (parallelExtractTool.execute === undefined) {
      throw new Error('Parallel extract tool is not executable.')
    }

    const output = await parallelExtractTool.execute(
      {
        objective: 'Explain what Vite+ provides.',
        urls: ['https://viteplus.dev/guide/']
      },
      {
        context: {},
        messages: [],
        toolCallId: 'parallel-extract-call'
      }
    )

    expect(output).toMatchObject({
      results: [
        {
          title: 'Vite+ Guide',
          url: 'https://viteplus.dev/guide/'
        }
      ]
    })
    expect(fetcher).toHaveBeenCalledOnce()

    const request = fetcher.mock.calls[0]
    const requestInput = request?.[0]
    const requestUrl =
      requestInput instanceof Request
        ? requestInput.url
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput
    const requestBody = request?.[1]?.body
    expect(requestUrl).toContain('/v1/extract')
    expect(typeof requestBody === 'string' ? requestBody : '').toContain(
      '"urls":["https://viteplus.dev/guide/"]'
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
