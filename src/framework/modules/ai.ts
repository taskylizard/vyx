import { omit, pick, pruneUndefined } from '@agentic/core'
import { Logger } from '@control.systems/logger'
import {
  type Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware,
  embed,
  generateText,
  tool,
  experimental_wrapLanguageModel as wrapLanguageModel
} from 'ai'
import { ChromaClient } from 'chromadb'
import { evaluate as math } from 'mathjs'
import type { ThreadChannel } from 'oceanic.js'
import { type OllamaProvider, createOllama } from 'ollama-ai-provider'
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

const NL = '!!NL!!'
const NL_PATTERN = new RegExp(NL, 'g')

export class AIModule {
  private client: Client
  private ollama: OllamaProvider
  private cache: LanguageModelV1Middleware
  private chroma: ChromaClient
  private embeddingCollection!: Awaited<
    ReturnType<ChromaClient['getOrCreateCollection']>
  >
  private activeThreads: Set<string> = new Set()
  private logger = new Logger(this.constructor.name)

  public constructor(client: Client) {
    this.client = client
    this.ollama = createOllama({
      baseURL: client.env.OLLAMA_API_HOST
    })
    this.cache = {
      wrapGenerate: async ({ doGenerate, params }) => {
        const cacheKey = JSON.stringify(params)
        const cachedResult = await this.client.redis.get(cacheKey)
        if (cachedResult)
          return JSON.parse(cachedResult) as ReturnType<typeof doGenerate>

        const result = await doGenerate()

        result.text = result.text
          ?.replaceAll(NL_PATTERN, '\n')
          .replaceAll(
            new RegExp(
              [
                this.client.env.DISCORD_TOKEN,
                this.client.env.DATABASE_URL,
                this.client.env.REDIS_HOST,
                this.client.env.DIVOLT_TOKEN,
                this.client.env.INFLUXDB_URL,
                this.client.env.INFLUXDB_ADMIN_TOKEN,
                this.client.env.LAVALINK_HOST,
                this.client.env.ERRORS_WEBHOOK_ID,
                this.client.env.ERRORS_WEBHOOK_TOKEN,
                this.client.env.REVOLT_TOKEN,
                this.client.env.OLLAMA_API_HOST,
                this.client.env.SEARXNG_API_HOST,
                this.client.env.CHROMA_API_HOST
              ].join('|'),
              'gi'
            ),
            '[redacted]'
          )

        // Cache the result (with an optional expiration time, e.g., 1 hour)
        await this.client.redis.set(
          cacheKey,
          JSON.stringify(result),
          'EX',
          3600
        )

        return result
      }

      // transformParams: async ({ params }) => {
      //   const lastUserMessageText = await this.embeddingCollection.get({
      //     where: {
      //       // @ts-expect-error
      //       threadId: params.providerMetadata!.genertation.threadId!
      //     }
      //   })
      //
      //   if (lastUserMessageText === null) {
      //     return params
      //   }
      // }
    }

    this.chroma = new ChromaClient({
      path: client.env.CHROMA_API_HOST
    })
    this.initializeChromaCollection()
  }

  private async initializeChromaCollection() {
    try {
      this.embeddingCollection = await this.chroma.getOrCreateCollection({
        name: 'thread',
        metadata: { 'hnsw:space': 'cosine' }
      })
    } catch (error) {
      console.error('Failed to initialize Chroma collection:', error)
    }
  }

  public async text(
    prompt: string,
    useTools: boolean = false,
    conversational: boolean = false,
    threadId?: string
  ): Promise<Result<string, string>> {
    const llamaGuard = await generateText({
      model: wrapLanguageModel({
        model: this.ollama('llama-guard3'),
        middleware: this.cache
      }),
      prompt
    })

    if (llamaGuard.text.includes('unsafe'))
      return { ok: false, error: 'unsafe' }

    const result = await generateText({
      prompt,
      model: wrapLanguageModel({
        model: this.ollama('llama3.1:70b'),
        middleware: this.cache
      }),
      experimental_providerMetadata: {
        generation: {
          mode: conversational ? 'chat' : 'text',
          ...(threadId ? { threadId } : {})
        }
      },
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
      },
      toolChoice: useTools ? 'required' : 'none',
      system: this.getSystemPrompt(useTools, conversational),
      maxSteps: 5,
      maxTokens: 2000
    })
    // Post-process the result to ensure correct JSON formatting
    const processedResult = this.processJsonInText(result.text)
    return { ok: true, result: processedResult }
    // return { ok: true, result: result.text }
  }

  private async search(
    query: string,
    opts: Omit<SearchEngineOptions, 'query'>
  ): Promise<SearchEngineResponse> {
    const res = await this.client.fetch<SearchEngineResponse>('/search', {
      method: 'GET',
      baseURL: this.client.env.SEARXNG_API_HOST,
      query: pruneUndefined({
        ...opts,
        // biome-ignore lint/style/useNamingConvention: dont care
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

  public async startChatThread(threadId: string): Promise<void> {
    if (this.activeThreads.has(threadId)) {
      this.logger.debug(`Already listening to thread ${threadId}`)
      return
    }

    await this.startListeningToThread(threadId)
    await this.client.redis.sadd('active_threads', threadId)
    this.logger.debug(`Started listening to thread ${threadId}`)
  }

  public async stopChatThread(threadId: string): Promise<void> {
    if (!this.activeThreads.has(threadId)) {
      this.logger.debug(`Not listening to thread ${threadId}`)
      return
    }

    this.activeThreads.delete(threadId)
    await this.client.redis.srem('active_threads', threadId)
    this.logger.debug(`Stopped listening to thread ${threadId}`)
  }

  // FIXME: Doesn't work well. Migrate to ai-sdk's middleware.
  private async startListeningToThread(threadId: string): Promise<void> {
    const thread = (await this.client.rest.channels.get(
      threadId
    )) as ThreadChannel

    if (!thread) {
      throw new Error('Invalid thread ID or not a thread channel')
    }
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return
      if (!message.inCachedGuildChannel())
        // biome-ignore lint/style/noParameterAssign: dont care
        message = await this.client.rest.channels.getMessage<ThreadChannel>(
          message.channelID,
          message.id
        )

      // Start typing indicator
      let typingInterval: NodeJS.Timeout | null = null
      const startTyping = () => {
        thread.sendTyping().catch((error) => {
          this.logger.error('Error sending typing indicator:', error)
        })
        typingInterval = setInterval(() => {
          thread.sendTyping().catch((error) => {
            this.logger.error('Error sending typing indicator:', error)
          })
        }, 10000)
      }

      const stopTyping = () => {
        if (typingInterval) {
          clearInterval(typingInterval)
          typingInterval = null
        }
      }

      startTyping()
      // Add the current message to the embedding collection
      const embedding = await this.embed(message.content)
      const metadata = {
        threadId,
        author: message.author.username,
        timestamp: message.createdAt.toISOString()
      }

      await this.embeddingCollection.add({
        ids: [message.id], // Use message ID as a unique identifier
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [message.content]
      })

      // Query for relevant context
      const queryResult = await this.embeddingCollection.get({
        limit: 10,
        ids: threadId
      })

      this.logger.info(queryResult)
      // Combine thread context with query results
      const context = queryResult.documents[0]!

      this.logger.debug(`${context}\n\nUser: ${message.content}`)
      const response = await this.text(
        `Context: ${context}\n\nUser: ${message.content}`,
        true,
        true
      )
      stopTyping()

      if (response.ok) {
        await thread.createMessage({
          content: response.result,
          allowedMentions: {
            repliedUser: true,
            roles: false,
            users: false,
            everyone: false
          },
          messageReference: {
            messageID: message.id
          }
        })
      } else {
        await thread.createMessage({
          content: "I'm sorry, I couldn't process that request.",
          allowedMentions: {
            repliedUser: false,
            roles: false,
            users: false,
            everyone: false
          },
          messageReference: {
            messageID: message.id
          }
        })
      }
    })

    this.activeThreads.add(threadId)
  }

  public async embed(text: string) {
    const result = await embed({
      model: this.ollama.textEmbeddingModel('nomic-embed-text'),
      value: text
    })

    return result.embedding
  }
  private processJsonInText(text: string): string {
    return text.replace(/\{[^}]+\}/g, (match) => {
      try {
        const jsonObject: any = JSON.parse(match)
        // Convert string arrays to actual arrays
        for (const key in jsonObject) {
          if (
            typeof jsonObject[key] === 'string' &&
            jsonObject[key].startsWith('[') &&
            jsonObject[key].endsWith(']')
          ) {
            try {
              jsonObject[key] = JSON.parse(jsonObject[key].replace(/'/g, '"'))
            } catch (_error) {
              // If parsing fails, keep the original string
              return match
            }
          }
        }
        return JSON.stringify(jsonObject, null, 2)
      } catch (_error) {
        // If parsing fails, return the original match
        return match
      }
    })
  }
  private getSystemPrompt(useTools: boolean, conversation: boolean): string {
    let prompt =
      'You are an AI assistant focused solely on answering questions and providing information. Do not discuss your own capabilities, functions, or how you process requests.'

    if (conversation) {
      prompt += `You are engaging in a friendly conversation with the user. 
      Your responses should be warm, empathetic, and tailored to the user's needs. 
      Use a conversational tone, and feel free to use casual language, less emojis, and humor when appropriate. 
      Show interest in the user's questions and experiences. 
      If you don't understand something, politely ask for clarification. 
      Remember past context in the conversation and refer back to it when relevant.
      `
    } else {
      prompt += 'Be as concise as possible. '
    }

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
    return await this.client.fetch<WikipediaPageSearchResponse>(
      'https://en.wikipedia.org/w/rest.php/v1/search/page',
      {
        // biome-ignore lint/style/useNamingConvention: dont care
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

    return await this.client.fetch<WikipediaPageSummaryResponse>(
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
