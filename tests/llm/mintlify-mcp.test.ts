import { asSchema, jsonSchema, tool, type ToolSet } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { z } from 'zod'
import { OPERATIONS_CHANNEL_ID, OPERATIONS_GUILD_ID } from '../../src/discord/ids.ts'
import {
  isOperationsScope,
  MintlifyMcpToolProvider,
  OperationsToolProvider,
  type ToolScope
} from '../../src/llm/mintlify-mcp.ts'
import { formatThinkingProgress } from '../../src/llm/tool-progress.ts'

function toolScope(overrides: Partial<ToolScope> = {}): ToolScope {
  return {
    canManageServer: false,
    channelID: OPERATIONS_CHANNEL_ID,
    guildID: OPERATIONS_GUILD_ID,
    sourceID: 'source-1',
    userID: 'user-1',
    ...overrides
  }
}

test('matches only the configured operations guild and channel', () => {
  expect(
    isOperationsScope({ channelID: OPERATIONS_CHANNEL_ID, guildID: OPERATIONS_GUILD_ID })
  ).toBe(true)
  expect(isOperationsScope({ channelID: 'other', guildID: OPERATIONS_GUILD_ID })).toBe(false)
  expect(isOperationsScope({ channelID: OPERATIONS_CHANNEL_ID, guildID: 'other' })).toBe(false)
  expect(isOperationsScope({ channelID: OPERATIONS_CHANNEL_ID, guildID: null })).toBe(false)
})

test('scopes combined Mintlify and Project Selene tools to operations', async () => {
  const provider = new OperationsToolProvider({
    instructions: 'Project Selene operations only.',
    provider: {
      resolve: async () => ({
        instructions: 'Mintlify operations only.',
        tools: {
          docs_search: tool({ inputSchema: z.object({ query: z.string() }) })
        }
      })
    },
    tools: {
      seleneSearchCode: tool({ inputSchema: z.object({ query: z.string() }) })
    }
  })

  const outside = await provider.resolve(toolScope({ channelID: 'other' }))
  expect(outside).toEqual({ tools: {} })
  const operations = await provider.resolve(toolScope())
  expect(Object.keys(operations.tools)).toEqual(['docs_search', 'seleneSearchCode'])
  expect(operations.instructions).toContain('Mintlify operations only.')
  expect(operations.instructions).toContain('Project Selene operations only.')
  expect(operations.maxToolIterations).toBeNull()
})

test('connects lazily and exposes namespaced MCP tools only in operations', async () => {
  const close = vi.fn(async () => undefined)
  const remoteTools: ToolSet = {
    search: tool({
      execute: async ({ query }) => query,
      inputSchema: z.object({ query: z.string() })
    })
  }
  const createClient = vi.fn(async () => ({
    close,
    instructions: 'Server instructions.',
    tools: async () => remoteTools
  }))
  const provider = new MintlifyMcpToolProvider({
    createClient
  })

  expect((await provider.resolve(toolScope({ channelID: 'other' }))).tools).toEqual({})
  expect(createClient).not.toHaveBeenCalled()

  const first = await provider.resolve(toolScope())
  const second = await provider.resolve(toolScope())

  expect(Object.keys(first.tools)).toEqual(['docs_search'])
  expect(first.instructions).toContain('documentation operations')
  expect(first.instructions).toContain('Server instructions.')
  expect(first.instructions).toContain('call docs_diff and show the user')
  expect(first.instructions).toContain('Never call docs_save unless the user explicitly approves')
  expect(first.instructions).toContain('initial request to edit documentation is not approval')
  expect(second.tools).toBe(first.tools)
  expect(createClient).toHaveBeenCalledOnce()

  await provider.close()
  expect(close).toHaveBeenCalledOnce()
})

test('shows MCP tool calls in the standard progress list', () => {
  expect(formatThinkingProgress(['search', 'docs_checkout', 'docs_diff'])).toBe(
    '*Thinking...*\n-# Tools: Search, Docs checkout, Docs diff'
  )
})

test('removes non-string enums from nested MCP schemas for provider compatibility', async () => {
  const execute = vi.fn(async () => 'done')
  const provider = new MintlifyMcpToolProvider({
    createClient: async () => ({
      close: async () => undefined,
      tools: async () => ({
        read: tool({
          execute,
          inputSchema: jsonSchema({
            properties: {
              mode: { enum: ['summary', 'full'], type: 'string' },
              options: {
                anyOf: [
                  {
                    properties: {
                      includeDrafts: { const: false, enum: [false], type: 'boolean' }
                    },
                    type: 'object'
                  }
                ]
              }
            },
            type: 'object'
          })
        })
      })
    })
  })

  const resolved = await provider.resolve(toolScope())
  const readTool = resolved.tools.docs_read
  expect(readTool).toBeDefined()
  const schema = await asSchema(readTool!.inputSchema).jsonSchema

  expect(schema).toMatchObject({
    properties: {
      mode: { enum: ['summary', 'full'], type: 'string' },
      options: {
        anyOf: [
          {
            properties: {
              includeDrafts: { type: 'boolean' }
            }
          }
        ]
      }
    }
  })
  expect(JSON.stringify(schema)).not.toContain('"enum":[false]')
  expect(JSON.stringify(schema)).not.toContain('"const":false')
  expect(readTool!.execute).toBe(execute)
})
