import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asSchema, type Tool, type ToolSet } from 'ai'
import { afterEach, expect, test } from 'vite-plus/test'
import {
  createMemoryTools,
  FORGET_TOOL_NAME,
  LIST_MEMORIES_TOOL_NAME,
  MEMORY_TOOLS_INSTRUCTIONS,
  MemoryToolProvider,
  REMEMBER_TOOL_NAME
} from '../../src/llm/tools/memory.ts'
import type { ToolScope } from '../../src/llm/mintlify-mcp.ts'
import { MarkdownMemoryStore, MEMORY_ENTRY_MAX_LENGTH } from '../../src/memory/markdown-memory.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

test('saves personal memory through the remember tool', async () => {
  const store = await createStore(() => '12345678-1234-4234-8234-123456789abc')
  const tools = createMemoryTools(store, toolScope())

  const output = await executeTool(tools, REMEMBER_TOOL_NAME, {
    content: 'Prefers concise answers',
    scope: 'personal'
  })

  expect(output).toBe('Saved personal memory 12345678.')
  await expect(store.list({ id: 'user-1', kind: 'user' })).resolves.toEqual([
    {
      content: 'Prefers concise answers',
      createdAt: '2026-07-30T00:00:00.000Z',
      id: '12345678-1234-4234-8234-123456789abc',
      sourceInteractionID: 'source-1'
    }
  ])
})

test('saves server memory only when the user can manage the server', async () => {
  const store = await createStore(() => '12345678-1234-4234-8234-123456789abc')
  const managed = createMemoryTools(store, toolScope({ canManageServer: true }))

  await expect(scopeEnumValues(managed, REMEMBER_TOOL_NAME)).resolves.toEqual([
    'personal',
    'server'
  ])
  const output = await executeTool(managed, REMEMBER_TOOL_NAME, {
    content: 'Server mascot is a crab',
    scope: 'server'
  })
  expect(output).toBe('Saved server memory 12345678.')
  await expect(store.list({ id: 'guild-1', kind: 'server' })).resolves.toHaveLength(1)

  const unmanaged = createMemoryTools(store, toolScope())
  await expect(scopeEnumValues(unmanaged, REMEMBER_TOOL_NAME)).resolves.toEqual(['personal'])
  await expect(scopeEnumValues(unmanaged, FORGET_TOOL_NAME)).resolves.toEqual(['personal'])
})

test('restricts memory tools to personal scope in direct messages', async () => {
  const store = await createStore()
  const tools = createMemoryTools(store, toolScope({ guildID: null }))

  await expect(scopeEnumValues(tools, REMEMBER_TOOL_NAME)).resolves.toEqual(['personal'])
  await expect(scopeEnumValues(tools, FORGET_TOOL_NAME)).resolves.toEqual(['personal'])
  await expect(scopeEnumValues(tools, LIST_MEMORIES_TOOL_NAME)).resolves.toEqual(['personal'])
  await expect(
    executeTool(tools, REMEMBER_TOOL_NAME, { content: 'Nope', scope: 'server' })
  ).rejects.toThrow('Server memory is only available in servers.')
})

test('lets anyone list server memory in a guild', async () => {
  const store = await createStore()
  const tools = createMemoryTools(store, toolScope())

  await expect(scopeEnumValues(tools, LIST_MEMORIES_TOOL_NAME)).resolves.toEqual([
    'personal',
    'server'
  ])
})

test('forgets memories and reports not-found and ambiguous outcomes', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  await store.remember({ id: 'user-1', kind: 'user' }, 'First memory', 'call-1')
  await store.remember({ id: 'user-1', kind: 'user' }, 'Second memory', 'call-2')
  const tools = createMemoryTools(store, toolScope())

  const ambiguous = await executeTool(tools, FORGET_TOOL_NAME, { id: '0000', scope: 'personal' })
  expect(ambiguous).toBe(
    '"0000" matches multiple personal memories. Retry with the full ID from listMemories.'
  )

  const notFound = await executeTool(tools, FORGET_TOOL_NAME, { id: 'ffff', scope: 'personal' })
  expect(notFound).toBe(
    'No personal memory matches "ffff". Call listMemories to see saved memory IDs.'
  )

  const forgotten = await executeTool(tools, FORGET_TOOL_NAME, {
    id: '00000000-0000-4000-8000-000000000000',
    scope: 'personal'
  })
  expect(forgotten).toBe('Forgot personal memory 00000000: First memory')
  await expect(store.list({ id: 'user-1', kind: 'user' })).resolves.toHaveLength(1)
})

test('lists memories with full IDs and content previews', async () => {
  const store = await createStore(() => '12345678-1234-4234-8234-123456789abc')
  await store.remember(
    { id: 'user-1', kind: 'user' },
    `Multiline\n\n${'memory '.repeat(40)}`,
    'call-1'
  )
  const tools = createMemoryTools(store, toolScope())

  const empty = await executeTool(tools, LIST_MEMORIES_TOOL_NAME, { scope: 'server' })
  expect(empty).toBe('No server memories saved.')

  const listed = await executeTool(tools, LIST_MEMORIES_TOOL_NAME, { scope: 'personal' })
  expect(listed).toContain('1 saved personal memory:\n- 12345678-1234-4234-8234-123456789abc: ')
  expect(listed).not.toContain('\n\n')
  expect(String(listed).length).toBeLessThan(300)
})

test('caps very long memory lists with a remaining count', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  for (let entry = 0; entry < 20; entry += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential writes keep memory IDs in order
    await store.remember({ id: 'user-1', kind: 'user' }, `Long memory ${'x'.repeat(300)}`, 'call')
  }
  const tools = createMemoryTools(store, toolScope())

  const listed = String(await executeTool(tools, LIST_MEMORIES_TOOL_NAME, { scope: 'personal' }))

  expect(listed).toContain('20 saved personal memories:')
  expect(listed).toContain('- …and ')
  expect(listed).toContain(' more')
  expect(listed.length).toBeLessThanOrEqual(4_200)
})

test('propagates store validation errors to the model', async () => {
  const store = await createStore()
  const tools = createMemoryTools(store, toolScope())

  await expect(
    executeTool(tools, REMEMBER_TOOL_NAME, {
      content: 'x'.repeat(MEMORY_ENTRY_MAX_LENGTH + 1),
      scope: 'personal'
    })
  ).rejects.toThrow(`Memory cannot exceed ${MEMORY_ENTRY_MAX_LENGTH} characters.`)
})

test('provides memory tools and instructions for every scope', async () => {
  const provider = new MemoryToolProvider({ store: await createStore() })

  const resolved = await provider.resolve(toolScope())

  expect(Object.keys(resolved.tools)).toEqual([
    FORGET_TOOL_NAME,
    LIST_MEMORIES_TOOL_NAME,
    REMEMBER_TOOL_NAME
  ])
  expect(resolved.instructions).toBe(MEMORY_TOOLS_INSTRUCTIONS)
  expect(resolved.maxToolIterations).toBeUndefined()
})

function toolScope(overrides: Partial<ToolScope> = {}): ToolScope {
  return {
    canManageServer: false,
    channelID: 'channel-1',
    guildID: 'guild-1',
    sourceID: 'source-1',
    userID: 'user-1',
    ...overrides
  }
}

async function createStore(createID?: () => string): Promise<MarkdownMemoryStore> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'kanikou-memory-tools-'))
  temporaryDirectories.push(rootDirectory)
  return new MarkdownMemoryStore({
    createID,
    now: () => new Date('2026-07-30T00:00:00.000Z'),
    rootDirectory
  })
}

function memoryID(index: number): string {
  return `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
}

function memoryTool(tools: ToolSet, name: string): Tool {
  if (!Object.hasOwn(tools, name)) {
    throw new Error(`Tool ${name} is not defined.`)
  }
  return tools[name]
}

async function executeTool(tools: ToolSet, name: string, input: unknown): Promise<unknown> {
  const execute = memoryTool(tools, name).execute
  if (execute === undefined) {
    throw new Error(`Tool ${name} is not executable.`)
  }
  return execute(input, { context: {}, messages: [], toolCallId: `test-${name}` })
}

async function scopeEnumValues(tools: ToolSet, name: string): Promise<readonly string[]> {
  const schema = await asSchema(memoryTool(tools, name).inputSchema).jsonSchema
  const scope = schema.properties?.scope
  if (scope === undefined || typeof scope === 'boolean' || scope.enum === undefined) {
    throw new Error(`Tool ${name} does not declare a scope enum.`)
  }
  return scope.enum
}
