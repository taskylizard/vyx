import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { expect, test, vi } from 'vite-plus/test'
import { generateKanikouResponse } from '../../src/llm/generation.ts'
import { formatCompletedResponse } from '../../src/llm/tool-progress.ts'
import { createKanikouTools, PARALLEL_SEARCH_TOOL_NAME } from '../../src/llm/tools/index.ts'

test('does not double the tools footer when the model echoes it in its final text', async () => {
  let requestCount = 0
  const modelFetch = vi.fn<typeof fetch>(async () => {
    requestCount += 1
    return requestCount === 1
      ? chatToolCall({
          objective: 'Explain Vite+.',
          search_queries: ['Vite+ vp command']
        })
      : chatText('Here is the answer.\n-# Tools: Search')
  })
  const parallelFetch = vi.fn<typeof fetch>(async () =>
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
  vi.stubGlobal('fetch', parallelFetch)

  try {
    const openrouter = createOpenRouter({ apiKey: 'openrouter-key', fetch: modelFetch })
    const content = await generateKanikouResponse(
      openrouter.chat('google/gemini-3-flash-preview'),
      [{ content: 'hi', role: 'user' }],
      createKanikouTools({ parallel: { apiKey: 'parallel-key' } })
    )

    const rendered = formatCompletedResponse(content, [PARALLEL_SEARCH_TOOL_NAME])
    expect(rendered).toBe('Here is the answer.\n-# Tools: Search')
    expect(rendered).not.toContain('Tools: Search\n')
  } finally {
    vi.unstubAllGlobals()
  }
})

function chatToolCall(argumentsJson: Record<string, unknown>): Response {
  return Response.json({
    choices: [
      {
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          content: null,
          role: 'assistant',
          tool_calls: [
            {
              function: {
                arguments: JSON.stringify(argumentsJson),
                name: PARALLEL_SEARCH_TOOL_NAME
              },
              id: 'call-1',
              type: 'function'
            }
          ]
        }
      }
    ],
    created: 1,
    id: 'chatcmpl-tool',
    model: 'google/gemini-3-flash-preview',
    object: 'chat.completion',
    usage: { completion_tokens: 10, prompt_tokens: 20, total_tokens: 30 }
  })
}

function chatText(text: string): Response {
  return Response.json({
    choices: [
      {
        finish_reason: 'stop',
        index: 0,
        message: { content: text, role: 'assistant' }
      }
    ],
    created: 2,
    id: 'chatcmpl-answer',
    model: 'google/gemini-3-flash-preview',
    object: 'chat.completion',
    usage: { completion_tokens: 8, prompt_tokens: 40, total_tokens: 48 }
  })
}
