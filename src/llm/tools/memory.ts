import { tool, type ToolSet } from 'ai'
import { match } from 'ts-pattern'
import { z } from 'zod'
import {
  MEMORY_ENTRY_MAX_LENGTH,
  type ForgetMemoryResult,
  type MemoryEntry,
  type MemoryScope,
  type MemoryStore
} from '../../memory/markdown-memory.ts'
import { previewMemory } from '../../memory/preview.ts'
import type { ScopedToolProvider, ScopedToolSet, ToolScope } from '../mintlify-mcp.ts'

export const REMEMBER_TOOL_NAME = 'remember'
export const FORGET_TOOL_NAME = 'forget'
export const LIST_MEMORIES_TOOL_NAME = 'listMemories'

export const MEMORY_TOOLS_INSTRUCTIONS = `You have long-term memory tools that persist across conversations. Use ${REMEMBER_TOOL_NAME} when the user asks you to remember something, or when you learn a clear, lasting fact or preference about the user (personal scope) or this server (server scope). Do not save secrets, sensitive personal data, or transient chat context, and do not save duplicates of existing memory. Use ${FORGET_TOOL_NAME} when the user asks you to forget or correct a memory, calling ${LIST_MEMORIES_TOOL_NAME} first to find the exact ID when unsure. Confirm memory changes briefly in your reply.`

export const MEMORY_LIST_MAX_LENGTH = 4_000
export const MEMORY_TOOL_PREVIEW_MAX_LENGTH = 200

export interface MemoryToolProviderConfig {
  store: MemoryStore
}

export class MemoryToolProvider implements ScopedToolProvider {
  readonly #store: MemoryStore

  constructor(config: MemoryToolProviderConfig) {
    this.#store = config.store
  }

  async resolve(scope: ToolScope): Promise<ScopedToolSet> {
    return {
      instructions: MEMORY_TOOLS_INSTRUCTIONS,
      tools: createMemoryTools(this.#store, scope)
    }
  }
}

export function createMemoryTools(store: MemoryStore, scope: ToolScope): ToolSet {
  const personalScope = { id: scope.userID, kind: 'user' } as const
  const serverScope =
    scope.guildID === null ? undefined : ({ id: scope.guildID, kind: 'server' } as const)

  const readableKinds =
    serverScope === undefined ? (['personal'] as const) : (['personal', 'server'] as const)
  const writableKinds =
    serverScope !== undefined && scope.canManageServer ? readableKinds : (['personal'] as const)

  const resolveScope = (kind: MemoryScopeKind): MemoryScope =>
    match(kind)
      .returnType<MemoryScope>()
      .with('personal', () => personalScope)
      .with('server', () => {
        if (serverScope === undefined) {
          throw new Error('Server memory is only available in servers.')
        }
        return serverScope
      })
      .exhaustive()

  return {
    [FORGET_TOOL_NAME]: tool({
      description:
        'Delete one saved memory by ID. Call listMemories first to find the exact ID when unsure.',
      execute: async ({ id, scope: kind }) => {
        const result = await store.forget(resolveScope(kind), id)
        return formatForgetMemoryToolResult(result, kind, id)
      },
      inputSchema: z.object({
        id: z
          .string()
          .min(4)
          .max(36)
          .describe('The full memory ID or an unambiguous ID prefix from listMemories.'),
        scope: z.enum(writableKinds).describe('The memory store to forget from.')
      })
    }),
    [LIST_MEMORIES_TOOL_NAME]: tool({
      description:
        'List saved memories with their IDs for one scope. Use to review what is remembered or to find a memory ID before forgetting it.',
      execute: async ({ scope: kind }) =>
        formatMemoryToolList(kind, await store.list(resolveScope(kind))),
      inputSchema: z.object({
        scope: z.enum(readableKinds).describe('The memory store to list.')
      })
    }),
    [REMEMBER_TOOL_NAME]: tool({
      description:
        'Save a durable memory. Use personal scope for facts and preferences about the current user, or server scope for facts shared with everyone in this server. Never save secrets, sensitive personal data, or transient chat context.',
      execute: async ({ content, scope: kind }) => {
        const entry = await store.remember(resolveScope(kind), content, scope.sourceID)
        return `Saved ${kind} memory ${entry.id.slice(0, 8)}.`
      },
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .max(MEMORY_ENTRY_MAX_LENGTH)
          .describe('The fact or preference to remember, written as one concise statement.'),
        scope: z.enum(writableKinds).describe('Where to save the memory.')
      })
    })
  }
}

type MemoryScopeKind = 'personal' | 'server'

function formatForgetMemoryToolResult(
  result: ForgetMemoryResult,
  kind: MemoryScopeKind,
  id: string
): string {
  return match(result)
    .returnType<string>()
    .with(
      { outcome: 'not-found' },
      () => `No ${kind} memory matches "${id}". Call listMemories to see saved memory IDs.`
    )
    .with(
      { outcome: 'ambiguous' },
      () => `"${id}" matches multiple ${kind} memories. Retry with the full ID from listMemories.`
    )
    .with(
      { outcome: 'forgotten' },
      ({ entry }) =>
        `Forgot ${kind} memory ${entry.id.slice(0, 8)}: ${previewMemory(entry.content, MEMORY_TOOL_PREVIEW_MAX_LENGTH)}`
    )
    .exhaustive()
}

function formatMemoryToolList(kind: MemoryScopeKind, entries: readonly MemoryEntry[]): string {
  if (entries.length === 0) {
    return `No ${kind} memories saved.`
  }

  const lines: string[] = []
  let length = 0
  for (const entry of entries) {
    const line = `- ${entry.id}: ${previewMemory(entry.content, MEMORY_TOOL_PREVIEW_MAX_LENGTH)}`
    if (length + line.length + 1 > MEMORY_LIST_MAX_LENGTH) {
      lines.push(`- …and ${entries.length - lines.length} more`)
      break
    }
    lines.push(line)
    length += line.length + 1
  }

  return `${entries.length} saved ${kind} ${entries.length === 1 ? 'memory' : 'memories'}:\n${lines.join('\n')}`
}
