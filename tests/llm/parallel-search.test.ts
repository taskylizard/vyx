import { expect, test, vi } from 'vite-plus/test'
import { createParallelSearchTool } from '../../src/llm/tools/parallel-search.ts'

test('uses the Parallel AI SDK package search tool', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      results: [
        {
          excerpts: ['The unified Vite+ command is vp.'],
          title: 'Vite+',
          url: 'https://viteplus.dev'
        }
      ],
      search_id: 'search-1',
      session_id: 'session-1'
    })
  )
  vi.stubGlobal('fetch', fetcher)

  try {
    const parallelSearchTool = createParallelSearchTool({ apiKey: 'parallel-key' })
    if (parallelSearchTool.execute === undefined) {
      throw new Error('Parallel search tool is not executable.')
    }

    const output = await parallelSearchTool.execute(
      {
        objective: 'Explain Vite+.',
        search_queries: ['Vite+ vp command']
      },
      {
        context: {},
        messages: [],
        toolCallId: 'parallel-search-call'
      }
    )

    expect(output).toMatchObject({
      results: [
        {
          title: 'Vite+',
          url: 'https://viteplus.dev'
        }
      ]
    })
    expect(fetcher).toHaveBeenCalledOnce()

    const request = fetcher.mock.calls[0]
    const requestInput = request[0]
    const requestUrl =
      requestInput instanceof Request
        ? requestInput.url
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput
    const requestBody = request[1]?.body
    expect(requestUrl).toContain('/v1/search')
    expect(typeof requestBody === 'string' ? requestBody : '').toContain('"mode":"advanced"')
  } finally {
    vi.unstubAllGlobals()
  }
})
