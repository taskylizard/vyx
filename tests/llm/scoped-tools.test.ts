import { tool } from 'ai'
import { expect, test } from 'vite-plus/test'
import { z } from 'zod'
import type { ScopedToolProvider, ToolScope } from '../../src/llm/mintlify-mcp.ts'
import { CompositeToolProvider } from '../../src/llm/scoped-tools.ts'

const scope: ToolScope = {
  canManageServer: false,
  channelID: 'channel-1',
  guildID: 'guild-1',
  sourceID: 'source-1',
  userID: 'user-1'
}

test('merges tools and joins instructions from all providers', async () => {
  const provider = new CompositeToolProvider([
    providerWith({ instructions: 'First.', tools: { alpha: noopTool() } }),
    providerWith({ instructions: 'Second.', tools: { beta: noopTool() } })
  ])

  const resolved = await provider.resolve(scope)

  expect(Object.keys(resolved.tools)).toEqual(['alpha', 'beta'])
  expect(resolved.instructions).toBe('First.\n\nSecond.')
})

test('uses the first declared tool iteration limit', async () => {
  const provider = new CompositeToolProvider([
    providerWith({ tools: {} }),
    providerWith({ maxToolIterations: null, tools: {} }),
    providerWith({ maxToolIterations: 4, tools: {} })
  ])

  await expect(provider.resolve(scope)).resolves.toMatchObject({ maxToolIterations: null })
})

test('omits instructions when no provider contributes them', async () => {
  const provider = new CompositeToolProvider([providerWith({ tools: {} })])

  const resolved = await provider.resolve(scope)

  expect(resolved.instructions).toBeUndefined()
  expect(resolved.maxToolIterations).toBeUndefined()
  expect(resolved.tools).toEqual({})
})

function noopTool() {
  return tool({ inputSchema: z.object({}) })
}

function providerWith(set: Awaited<ReturnType<ScopedToolProvider['resolve']>>): ScopedToolProvider {
  return { resolve: async () => set }
}
