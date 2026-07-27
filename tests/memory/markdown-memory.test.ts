import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vite-plus/test'
import {
  MarkdownMemoryStore,
  MEMORY_ENTRY_LIMIT,
  MEMORY_PROMPT_SCOPE_MAX_LENGTH,
  MemoryStoreError
} from '../../src/memory/markdown-memory.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

test('stores readable Markdown and restores structured memory entries', async () => {
  const rootDirectory = await temporaryDirectory()
  const store = new MarkdownMemoryStore({
    createID: () => '12345678-1234-4234-8234-123456789abc',
    now: () => new Date('2026-07-13T12:00:00.000Z'),
    rootDirectory
  })

  const saved = await store.remember(
    { id: 'user-1', kind: 'user' },
    'Prefers concise answers.\n\nUses **TypeScript**.',
    'interaction-1'
  )

  expect(saved.id).toBe('12345678-1234-4234-8234-123456789abc')
  await expect(store.list({ id: 'user-1', kind: 'user' })).resolves.toEqual([saved])
  const markdown = await store.exportMarkdown({ id: 'user-1', kind: 'user' })
  expect(markdown).toContain('# Kanikou personal memory')
  expect(markdown).toContain('## `12345678-1234-4234-8234-123456789abc`')
  expect(markdown).toContain('Prefers concise answers.\n\nUses **TypeScript**.')
})

test('isolates personal and server memory and renders both for prompts', async () => {
  const store = await createStore()
  await store.remember({ id: 'user-1', kind: 'user' }, 'Personal preference', 'personal-call')
  await store.remember({ id: 'server-1', kind: 'server' }, 'Shared server fact', 'server-call')

  await expect(store.list({ id: 'user-2', kind: 'user' })).resolves.toEqual([])
  await expect(store.promptContext('user-1', 'server-1')).resolves.toEqual({
    personal: '- Personal preference',
    server: '- Shared server fact'
  })
  await expect(store.promptContext('user-1', null)).resolves.toEqual({
    personal: '- Personal preference',
    server: undefined
  })
})

test('forgets by unambiguous ID prefix and clears a complete scope', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  const first = await store.remember({ id: 'user-1', kind: 'user' }, 'First', 'call-1')
  await store.remember({ id: 'user-1', kind: 'user' }, 'Second', 'call-2')

  await expect(store.forget({ id: 'user-1', kind: 'user' }, first.id.slice(0, 8))).resolves.toEqual(
    { entry: first, outcome: 'forgotten' }
  )
  await expect(store.list({ id: 'user-1', kind: 'user' })).resolves.toHaveLength(1)
  await expect(store.clear({ id: 'user-1', kind: 'user' })).resolves.toBe(1)
  await expect(store.list({ id: 'user-1', kind: 'user' })).resolves.toEqual([])
  await expect(store.clear({ id: 'user-1', kind: 'user' })).resolves.toBe(0)
})

test('serializes heavy concurrent writes without losing entries', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  const scope = { id: 'busy-user', kind: 'user' } as const

  await Promise.all(
    Array.from({ length: MEMORY_ENTRY_LIMIT }, async (_, memoryIndex) =>
      store.remember(scope, `Memory ${memoryIndex}`, `interaction-${memoryIndex}`)
    )
  )

  const entries = await store.list(scope)
  expect(entries).toHaveLength(MEMORY_ENTRY_LIMIT)
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(MEMORY_ENTRY_LIMIT)
  await expect(store.remember(scope, 'One too many', 'overflow-call')).rejects.toMatchObject({
    code: 'entry-limit'
  })
})

test('bounds recalled prompt memory independently of stored Markdown size', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  const scope = { id: 'user-1', kind: 'user' } as const
  await store.remember(scope, `0:${'x'.repeat(990)}`, 'call-0')
  await store.remember(scope, `1:${'x'.repeat(990)}`, 'call-1')
  await store.remember(scope, `2:${'x'.repeat(990)}`, 'call-2')
  await store.remember(scope, `3:${'x'.repeat(990)}`, 'call-3')
  await store.remember(scope, `4:${'x'.repeat(990)}`, 'call-4')

  const context = await store.promptContext(scope.id, null)
  expect(context.personal?.length).toBeLessThanOrEqual(MEMORY_PROMPT_SCOPE_MAX_LENGTH)
  expect(context.personal).toContain('4:')
  expect(context.personal).not.toContain('0:')
})

test('rejects unsafe memory sizes and underspecified forget IDs', async () => {
  const store = await createStore()

  await expect(store.remember({ id: 'user-1', kind: 'user' }, ' ', 'call')).rejects.toEqual(
    expect.objectContaining<Partial<MemoryStoreError>>({ code: 'empty' })
  )
  await expect(store.forget({ id: 'user-1', kind: 'user' }, 'abc')).rejects.toEqual(
    expect.objectContaining<Partial<MemoryStoreError>>({ code: 'identifier-too-short' })
  )
})

test('escapes Markdown headings reserved for memory record boundaries', async () => {
  let index = 0
  const store = await createStore(() => memoryID(index++))
  const content = `Before\n\n## \`${memoryID(99)}\`\n\nAfter`

  await store.remember({ id: 'user-1', kind: 'user' }, content, 'call')

  const entries = await store.list({ id: 'user-1', kind: 'user' })
  expect(entries).toHaveLength(1)
  expect(entries[0]?.content).toContain(`\\## \`${memoryID(99)}\``)
  expect(entries[0]?.content).toContain('After')
})

async function createStore(createID: () => string = () => memoryID(0)) {
  return new MarkdownMemoryStore({
    createID,
    now: () => new Date('2026-07-13T12:00:00.000Z'),
    rootDirectory: await temporaryDirectory()
  })
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-memory-'))
  temporaryDirectories.push(directory)
  return directory
}

function memoryID(index: number): string {
  return `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
}
