export interface MemoryEntry {
  content: string
  createdAt: string
  id: string
  sourceInteractionID: string
}

export interface MemoryPromptContext {
  personal: string | undefined
  server: string | undefined
}

export type MemoryScope = { id: string; kind: 'server' } | { id: string; kind: 'user' }

export type ForgetMemoryResult =
  | { entry: MemoryEntry; outcome: 'forgotten' }
  | { outcome: 'ambiguous' }
  | { outcome: 'not-found' }

export interface MemoryStore {
  clear(scope: MemoryScope): Promise<number>
  exportMarkdown(scope: MemoryScope): Promise<string>
  forget(scope: MemoryScope, identifier: string): Promise<ForgetMemoryResult>
  list(scope: MemoryScope): Promise<MemoryEntry[]>
  promptContext(userID: string, serverID: string | null): Promise<MemoryPromptContext>
  remember(scope: MemoryScope, content: string, sourceInteractionID: string): Promise<MemoryEntry>
}

export type MemoryStoreErrorCode =
  | 'empty'
  | 'entry-limit'
  | 'entry-too-long'
  | 'identifier-too-short'

export interface MarkdownMemoryStoreOptions {
  createID?: () => string
  now?: () => Date
  rootDirectory?: string
}
