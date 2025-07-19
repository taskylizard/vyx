/// <reference types="@cloudflare/workers-types" />
import { omit, pick, pruneUndefined } from '@agentic/core'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
  type LanguageModelV1Middleware,
  createProviderRegistry,
  customProvider,
  generateText,
  tool,
  wrapLanguageModel
} from 'ai'
import type { LanguageModelV1 } from 'ai'
import { evaluate as math } from 'mathjs'
import { Logger } from 'tracix'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import type { Client, Result } from '#framework'
import {
  type SearchEngineOptions,
  type SearchEngineResponse,
  type SearchEngineResult,
  SearchOptionsSchema,
  type WikipediaPageSearchResponse,
  type WikipediaPageSummaryOptions,
  type WikipediaPageSummaryResponse,
  type WikipediaSearchOptions
} from './types'

export class AIModule {
  private client: Client
  private cache: LanguageModelV1Middleware
  private logger = new Logger(this.constructor.name)
  private registry: ReturnType<AIModule['createRegistry']>

  public constructor(client: Client) {
    this.client = client
    this.registry = this.createRegistry()

    const redis = this.client.redis
    this.cache = {
      wrapGenerate: async ({ doGenerate, params }) => {
        const cacheKey = JSON.stringify(params)

        const _cached = await redis.get(cacheKey)
        if (_cached !== null) {
          const cached = JSON.parse(_cached) as Awaited<
            ReturnType<LanguageModelV1['doGenerate']>
          >
          return {
            ...cached,
            response: {
              ...cached.response,
              timestamp: cached.response?.timestamp
                ? new Date(cached.response?.timestamp)
                : undefined
            }
          }
        }

        const result = await doGenerate()

        redis.set(cacheKey, JSON.stringify(result))

        return result
      }
    }
  }
  private createRegistry() {
    const cloudflareProvider = createWorkersAI({
      accountId: this.client.env.CLOUDFLARE_AI_ACCOUNT_ID,
      apiKey: this.client.env.CLOUDFLARE_AI_API_KEY
    })

    const cloudflare = customProvider({
      languageModels: {
        'hermes-2-pro-mistral-7b': cloudflareProvider(
          '@hf/nousresearch/hermes-2-pro-mistral-7b'
        ),
        'llama-3-8b-instruct': cloudflareProvider(
          '@cf/meta/llama-3-8b-instruct'
        ),
        '@thebloke/llamaguard-7b-awq': cloudflareProvider(
          '@hf/thebloke/llamaguard-7b-awq'
        ),
        'gemma-7b-it': cloudflareProvider('@hf/google/gemma-7b-it')
      }
    })
    type HuggingfaceChatModelIds =
      | 'meta-llama/Llama-3.1-8B-Instruct'
      | 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B'
      | (string & {})
    type HuggingfaceCompletionModelIds = string & {}
    type HuggingfaceEmbeddingModelIds = string & {}
    type HuggingfaceImageModelIds = string & {}

    const huggingfaceProvider = createOpenAICompatible<
      HuggingfaceChatModelIds,
      HuggingfaceCompletionModelIds,
      HuggingfaceEmbeddingModelIds,
      HuggingfaceImageModelIds
    >({
      name: 'huggingface',
      apiKey: this.client.env.HUGGINGFACE_API_KEY,
      baseURL: 'https://router.huggingface.co/v1'
    })

    const huggingface = customProvider({
      languageModels: {
        'llama-3.1-8B-Instruct': huggingfaceProvider(
          'meta-llama/Llama-3.1-8B-Instruct'
        ),
        'DeepSeek-R1-Distill-Qwen-1.5B': huggingfaceProvider(
          'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B'
        )
      }
    })
    return createProviderRegistry({ cloudflare, huggingface })
  }

  public async chat(prompt: string, useTools: boolean = false) {
    const llamaGuard = await generateText({
      model: wrapLanguageModel({
        model: this.registry.languageModel(
          'cloudflare:@thebloke/llamaguard-7b-awq'
        ),
        middleware: this.cache
      }),
      prompt
    })

    if (llamaGuard.text.includes('unsafe'))
      return { ok: false, error: 'unsafe' }

    const model =
      this.client.env.NODE_ENV === 'development'
        ? this.registry.languageModel('cloudflare:llama-3-8b-instruct')
        : wrapLanguageModel({
            model: this.registry.languageModel(
              'cloudflare:hermes-2-pro-mistral-7b'
            ),
            middleware: [this.cache]
          })

    const result = await generateText({
      prompt,
      model,
      toolChoice: useTools ? 'required' : 'none',
      system: this.getSystemPrompt(useTools),
      maxSteps: 10,
      maxTokens: 2000,
      tools: {
        calculate: tool({
          description:
            'A tool for evaluating mathematical expressions. ' +
            'Example expressions: ' +
            ":'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
          parameters: z.object({ expression: z.string() }),
          execute: async ({ expression }) => math(expression)
        }),
        search: tool({
          description: `Searches across multiple search engines using a local instance of Searxng. To search only specific engines, use the \`engines\` parameter.

The most important search engines are:

- "reddit" (Reddit posts)
- "google" (Google web search)
- "google news" (Google News search)
- "brave" (Brave web search)
- "arxiv" (academic papers)
- "genius" (Genius.com for song lyrics)
- "imdb" (movies and TV shows)
- "hackernews" (Hacker News)
- "wikidata" (Wikidata)
- "wolframalpha" (Wolfram Alpha)
- "youtube" (YouTube videos)
- "github" (GitHub code and repositories)

IMPORTANT: When specifying categories or engines, always use a valid JSON array format. For example:
- Correct: {"categories": ["general", "news"], "query": "latest events"}
- Incorrect: {"categories": "['general', 'news']", "query": "latest events"}
`,
          parameters: SearchOptionsSchema,
          execute: async ({ query, ...opts }) => this.search(query, opts)
        }),
        date: tool({
          description: 'A tool for getting the current date.',
          parameters: z.object({}),
          execute: async () => new Date()
        }),
        wikipedia_page_search: tool({
          description: 'Searches Wikipedia for pages matching the given query.',
          parameters: z.object({
            query: z.string().describe('Search query')
          }),
          execute: async (params) => this.wikipediaSearch(params)
        }),
        wikipedia_get_page_summary: tool({
          description: 'Gets a summary of the given Wikipedia page.',
          parameters: z.object({
            title: z.string().describe('Wikipedia page title'),
            acceptLanguage: z
              .string()
              .optional()
              .default('en-us')
              .describe('Locale code for the language to use.')
          }),
          execute: async (params) => this.getWikipediaPageSummary(params)
        })
      }
    })
    return { ok: true, result: result.text }
  }

  private async search(
    query: string,
    opts: Omit<SearchEngineOptions, 'query'>
  ): Promise<SearchEngineResponse> {
    const res = await this.client.fetcher<SearchEngineResponse>('/search', {
      method: 'GET',
      baseURL: this.client.env.SEARXNG_API_HOST,
      query: pruneUndefined({
        ...opts,
        q: query,
        categories: opts.categories?.join(','),
        engines: opts.engines?.join(','),
        format: 'json'
      })
    })

    res.results = res.results?.map(
      (result: any) =>
        omit(
          result,
          'parsed_url',
          'engines',
          'positions',
          'template'
        ) as SearchEngineResult
    )

    return pick(res, 'results', 'suggestions', 'query')
  }

  private getSystemPrompt(useTools: boolean): string {
    let prompt =
      'You are an AI assistant focused solely on answering questions and providing information.'

    prompt +=
      'Do not discuss your own capabilities, functions, or how you process requests.'
    prompt += 'Be as concise as possible. '
    prompt += 'Reason step by step. '

    if (useTools) {
      prompt += `IMPORTANT: You have access to several tools that can help you provide accurate and up-to-date information. Always consider using these tools when appropriate:
        - Use the 'search' tool to find current information on any topic.
        - Use the 'calculate' tool for any mathematical calculations.
        - Use the 'date' tool to get the current date.
        - Use the 'wikipedia_page_search' tool to search Wikipedia for articles.
        - Use the 'wikipedia_get_page_summary' tool to get a summary of a Wikipedia article.
      Do not hesitate to use these tools multiple times if needed. If you're unsure about any information, use the search tool to verify.
      Do not mention anything about function calls, API requests, or how you process information. Focus only on answering the question asked.
      If you don't understand something, politely ask for clarification.
      If no question is asked, just answer with a normal response to respond with the user in a friendly manner, like a greeting.
      `
    }

    return prompt
  }

  private async wikipediaSearch({ query, ...opts }: WikipediaSearchOptions) {
    return await this.client.fetcher<WikipediaPageSearchResponse>(
      'https://en.wikipedia.org/w/rest.php/v1/search/page',
      {
        query: { q: query, ...opts }
      }
    )
  }

  private async getWikipediaPageSummary({
    title,
    acceptLanguage = 'en-us',
    redirect = true,
    ...opts
  }: WikipediaPageSummaryOptions) {
    title = title.trim().replaceAll(' ', '_')

    return await this.client.fetcher<WikipediaPageSummaryResponse>(
      `/page/summary/${title}`,
      {
        baseURL: 'https://en.wikipedia.org/api/rest_v1',
        query: { redirect, ...opts },
        headers: {
          'accept-language': acceptLanguage
        },
        redirect: 'follow'
      }
    )
  }
}
