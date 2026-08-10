import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { match } from 'ts-pattern'
import type {
  ForgetMemoryResult,
  MarkdownMemoryStoreOptions,
  MemoryEntry,
  MemoryPromptContext,
  MemoryScope,
  MemoryStore,
  MemoryStoreErrorCode
} from './types.ts'

export const MEMORY_ENTRY_LIMIT = 100
export const MEMORY_ENTRY_MAX_LENGTH = 1_000
export const MEMORY_PROMPT_SCOPE_MAX_LENGTH = 3_000

const MEMORY_ID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const MEMORY_RESERVED_HEADING_PATTERN = new RegExp(`^## (\`${MEMORY_ID_PATTERN}\`)$`, 'gmu')
const MEMORY_ENTRY_PATTERN = new RegExp(
  '^## `(' +
    MEMORY_ID_PATTERN +
    ')`\\n\\n_Added: ([^\\n]+)_\\n_Source interaction: `([^\\n]+)`_\\n\\n([\\s\\S]*?)(?=\\n## `' +
    MEMORY_ID_PATTERN +
    '`\\n|(?![\\s\\S]))',
  'gmu'
)

export type {
  ForgetMemoryResult,
  MarkdownMemoryStoreOptions,
  MemoryEntry,
  MemoryPromptContext,
  MemoryScope,
  MemoryStore,
  MemoryStoreErrorCode
} from './types.ts'

export class MemoryStoreError extends Error {
  readonly code: MemoryStoreErrorCode

  constructor(code: MemoryStoreErrorCode, message: string) {
    super(message)
    this.name = 'MemoryStoreError'
    this.code = code
  }
}

export class MarkdownMemoryStore implements MemoryStore {
  readonly #createID: () => string
  readonly #now: () => Date
  readonly #rootDirectory: string
  readonly #writeQueues = new Map<string, Promise<void>>()

  constructor(options: MarkdownMemoryStoreOptions = {}) {
    this.#createID = options.createID ?? randomUUID
    this.#now = options.now ?? (() => new Date())
    this.#rootDirectory = options.rootDirectory ?? resolve(process.cwd(), 'data/memory')
  }

  async list(scope: MemoryScope): Promise<MemoryEntry[]> {
    return parseMemoryEntries(await this.#read(scope))
  }

  async remember(
    scope: MemoryScope,
    content: string,
    sourceInteractionID: string
  ): Promise<MemoryEntry> {
    const normalized = content.trim()
    if (normalized.length === 0) {
      throw new MemoryStoreError('empty', 'Memory cannot be empty.')
    }
    if (normalized.length > MEMORY_ENTRY_MAX_LENGTH) {
      throw new MemoryStoreError(
        'entry-too-long',
        `Memory cannot exceed ${MEMORY_ENTRY_MAX_LENGTH} characters.`
      )
    }

    return this.#mutate(scope, async (entries) => {
      if (entries.length >= MEMORY_ENTRY_LIMIT) {
        throw new MemoryStoreError(
          'entry-limit',
          `Memory is limited to ${MEMORY_ENTRY_LIMIT} entries per scope.`
        )
      }

      const entry = {
        content: escapeReservedMemoryHeadings(normalized),
        createdAt: this.#now().toISOString(),
        id: this.#createID(),
        sourceInteractionID
      } satisfies MemoryEntry
      entries.push(entry)
      return entry
    })
  }

  async forget(scope: MemoryScope, identifier: string): Promise<ForgetMemoryResult> {
    const normalized = identifier.trim().toLowerCase()
    if (normalized.length < 4) {
      throw new MemoryStoreError(
        'identifier-too-short',
        'Use at least the first four characters of the memory ID.'
      )
    }

    return this.#mutate(scope, async (entries) => {
      const matches = entries.filter((entry) => entry.id.toLowerCase().startsWith(normalized))
      if (matches.length === 0) {
        return { outcome: 'not-found' }
      }
      if (matches.length > 1) {
        return { outcome: 'ambiguous' }
      }

      const entry = matches[0]
      entries.splice(entries.indexOf(entry), 1)
      return { entry, outcome: 'forgotten' }
    })
  }

  async clear(scope: MemoryScope): Promise<number> {
    const path = this.#path(scope)
    return this.#withWriteQueue(path, async () => {
      const markdown = await readMemoryFile(path)
      if (markdown.length === 0) {
        return 0
      }
      const entries = parseMemoryEntries(markdown)
      await removeMemoryFile(path)
      return entries.length
    })
  }

  async exportMarkdown(scope: MemoryScope): Promise<string> {
    const markdown = await this.#read(scope)
    return markdown.length === 0 ? serializeMemoryFile(scope, []) : markdown
  }

  async promptContext(userID: string, serverID: string | null): Promise<MemoryPromptContext> {
    const [personalEntries, serverEntries] = await Promise.all([
      this.list({ id: userID, kind: 'user' }),
      serverID === null ? Promise.resolve([]) : this.list({ id: serverID, kind: 'server' })
    ])

    return {
      personal: renderPromptMemory(personalEntries),
      server: renderPromptMemory(serverEntries)
    }
  }

  async #mutate<TResult>(
    scope: MemoryScope,
    mutation: (entries: MemoryEntry[]) => Promise<TResult>
  ): Promise<TResult> {
    const path = this.#path(scope)
    return this.#withWriteQueue(path, async () => {
      const entries = parseMemoryEntries(await readMemoryFile(path))
      const result = await mutation(entries)
      if (entries.length === 0) {
        await removeMemoryFile(path)
      } else {
        await writeMemoryFile(path, serializeMemoryFile(scope, entries))
      }
      return result
    })
  }

  async #read(scope: MemoryScope): Promise<string> {
    const path = this.#path(scope)
    await this.#writeQueues.get(path)
    return readMemoryFile(path)
  }

  #path(scope: MemoryScope): string {
    const digest = createHash('sha256').update(scope.id).digest('hex')
    const directory = match(scope.kind)
      .with('user', () => 'users')
      .with('server', () => 'servers')
      .exhaustive()
    return resolve(
      this.#rootDirectory,
      directory,
      digest.slice(0, 2),
      digest.slice(2, 4),
      `${digest}.md`
    )
  }

  async #withWriteQueue<TResult>(
    path: string,
    operation: () => Promise<TResult>
  ): Promise<TResult> {
    const previous = this.#writeQueues.get(path) ?? Promise.resolve()
    const pending = previous.catch(() => undefined).then(operation)
    const settled = pending.then(
      () => undefined,
      () => undefined
    )
    this.#writeQueues.set(path, settled)

    try {
      return await pending
    } finally {
      if (this.#writeQueues.get(path) === settled) {
        this.#writeQueues.delete(path)
      }
    }
  }
}

function escapeReservedMemoryHeadings(content: string): string {
  return content.replaceAll(MEMORY_RESERVED_HEADING_PATTERN, String.raw`\## $1`)
}

function serializeMemoryFile(scope: MemoryScope, entries: readonly MemoryEntry[]): string {
  const title = match(scope.kind)
    .with('user', () => 'Kanikou personal memory')
    .with('server', () => 'Kanikou server memory')
    .exhaustive()
  const body = entries
    .map(
      (entry) =>
        `## \`${entry.id}\`\n\n_Added: ${entry.createdAt}_\n_Source interaction: \`${entry.sourceInteractionID}\`_\n\n${entry.content.trim()}`
    )
    .join('\n\n')

  return `# ${title}\n\n> Managed by Kanikou. Use Discord's memory commands to update this file.${body.length === 0 ? '\n' : `\n\n${body}\n`}`
}

function parseMemoryEntries(markdown: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  for (const match of markdown.matchAll(MEMORY_ENTRY_PATTERN)) {
    entries.push({
      content: match[4].trim(),
      createdAt: match[2],
      id: match[1],
      sourceInteractionID: match[3]
    })
  }
  return entries
}

function renderPromptMemory(entries: readonly MemoryEntry[]): string | undefined {
  if (entries.length === 0) {
    return undefined
  }

  const selected: string[] = []
  let length = 0
  for (const entry of entries.toReversed()) {
    const item = `- ${entry.content.replaceAll('\n', '\n  ')}`
    if (length + item.length + 1 > MEMORY_PROMPT_SCOPE_MAX_LENGTH) {
      continue
    }
    selected.push(item)
    length += item.length + 1
  }

  return selected.length === 0 ? undefined : selected.toReversed().join('\n')
}

async function readMemoryFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return ''
    }
    throw error
  }
}

async function writeMemoryFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function removeMemoryFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) {
      throw error
    }
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}
