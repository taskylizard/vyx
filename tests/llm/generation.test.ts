import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { tool } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { z } from 'zod'
import { generateKanikouResponse } from '../../src/llm/generation.ts'
import {
  createKanikouTools,
  PARALLEL_EXTRACT_TOOL_NAME,
  PARALLEL_SEARCH_TOOL_NAME
} from '../../src/llm/tools/index.ts'

test('runs the Parallel package tool through the OpenRouter model loop', async () => {
  const calledTools: string[] = []
  const completedTools: string[] = []
  const completedSteps: string[] = []
  const startedSteps: number[] = []
  let requestCount = 0
  const modelFetch = vi.fn<typeof fetch>(async () => {
    requestCount += 1
    return requestCount === 1
      ? chatToolCall(PARALLEL_SEARCH_TOOL_NAME, 'parallel-search-call', {
          objective: 'Explain Vite+.',
          search_queries: ['Vite+ vp command']
        })
      : chatText('Vite+ uses the vp command.[source](https://viteplus.dev)')
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
    const tools = createKanikouTools({ parallel: { apiKey: 'parallel-key' } })

    expect(Object.keys(tools)).toEqual([PARALLEL_SEARCH_TOOL_NAME, PARALLEL_EXTRACT_TOOL_NAME])
    const response = await generateKanikouResponse(
      openrouter.chat('google/gemini-3-flash-preview'),
      [{ content: 'What is Vite+?', role: 'user' }],
      tools,
      {
        onStepEnd: ({ finishReason, stepNumber }) => {
          completedSteps.push(`${stepNumber}:${finishReason}`)
        },
        onStepStart: ({ stepNumber }) => {
          startedSteps.push(stepNumber)
        },
        onToolExecutionEnd: ({ outcome, toolName }) => {
          completedTools.push(`${toolName}:${outcome}`)
        },
        onToolExecutionStart: ({ toolName }) => {
          calledTools.push(toolName)
        }
      }
    )

    expect(response).toBe('Vite+ uses the vp command.[[1]](<https://viteplus.dev>)')
    expect(modelFetch).toHaveBeenCalledTimes(2)
    const firstRequest = modelFetch.mock.calls[0]
    expect(requestUrl(firstRequest?.[0])).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(new Headers(firstRequest?.[1]?.headers).get('authorization')).toBe(
      'Bearer openrouter-key'
    )
    expect(requestBody(firstRequest)).toMatchObject({
      model: 'google/gemini-3-flash-preview',
      temperature: 0.4,
      top_p: 0.8
    })
    expect(parallelFetch).toHaveBeenCalledOnce()
    expect(calledTools).toEqual([PARALLEL_SEARCH_TOOL_NAME])
    expect(completedTools).toEqual([`${PARALLEL_SEARCH_TOOL_NAME}:success`])
    expect(startedSteps).toEqual([0, 1])
    expect(completedSteps).toEqual(['0:tool-calls', '1:stop'])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('forces the final iteration to answer instead of calling another tool', async () => {
  let requestCount = 0
  const modelFetch = vi.fn<typeof fetch>(async () => {
    requestCount += 1
    return requestCount < 6
      ? chatToolCall('repositorySearch', `search-${requestCount}`, {
          query: `attempt-${requestCount}`
        })
      : chatText('Here is the best answer from the gathered evidence.')
  })
  const execute = vi.fn(async ({ query }: { query: string }) => `Result for ${query}`)
  const openrouter = createOpenRouter({ apiKey: 'openrouter-key', fetch: modelFetch })

  const response = await generateKanikouResponse(
    openrouter.chat('google/gemini-3-flash-preview'),
    [{ content: 'Research this repository.', role: 'user' }],
    {
      repositorySearch: tool({
        execute,
        inputSchema: z.object({ query: z.string() })
      })
    }
  )

  expect(response).toBe('Here is the best answer from the gathered evidence.')
  expect(execute).toHaveBeenCalledTimes(5)
  expect(modelFetch).toHaveBeenCalledTimes(6)
  expect(requestBody(modelFetch.mock.calls[5]).tool_choice).toBeUndefined()
  expect(requestBody(modelFetch.mock.calls[5]).tools).toBeUndefined()
})

test('supports unlimited tool iterations for scoped documentation workflows', async () => {
  let requestCount = 0
  const modelFetch = vi.fn<typeof fetch>(async () => {
    requestCount += 1
    return requestCount < 8
      ? chatToolCall('docsRead', `docs-${requestCount}`, { path: `/page-${requestCount}` })
      : chatText('Documentation workflow completed.')
  })
  const execute = vi.fn(async () => 'Page content')
  const openrouter = createOpenRouter({ apiKey: 'openrouter-key', fetch: modelFetch })

  const response = await generateKanikouResponse(
    openrouter.chat('google/gemini-3-flash-preview'),
    [{ content: 'Complete this docs workflow.', role: 'user' }],
    {
      docsRead: tool({ execute, inputSchema: z.object({ path: z.string() }) })
    },
    { maxToolIterations: null }
  )

  expect(response).toBe('Documentation workflow completed.')
  expect(execute).toHaveBeenCalledTimes(7)
  expect(modelFetch).toHaveBeenCalledTimes(8)
})

function chatToolCall(name: string, callID: string, input: unknown): Response {
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
              function: { arguments: JSON.stringify(input), name },
              id: callID,
              type: 'function'
            }
          ]
        }
      }
    ],
    created: 1,
    id: `chatcmpl-${callID}`,
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

function requestBody(call: Parameters<typeof fetch> | undefined): Record<string, unknown> {
  const body = call?.[1]?.body
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {}
}

function requestUrl(input: Parameters<typeof fetch>[0] | undefined): string {
  if (input === undefined) return ''
  if (input instanceof Request) return input.url
  return input instanceof URL ? input.href : input
}
