import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import {
  GitHubCodeSearchResponseSchema,
  GitHubCommitResponseSchema,
  GitHubTreeResponseSchema,
  type GitHubTreeResponse,
  type ProjectSeleneConfig
} from './project-selene-types.ts'

export type { ProjectSeleneConfig } from './project-selene-types.ts'

export const PROJECT_SELENE_LIST_FILES_TOOL_NAME = 'seleneListFiles'
export const PROJECT_SELENE_READ_FILE_TOOL_NAME = 'seleneReadFile'
export const PROJECT_SELENE_SEARCH_CODE_TOOL_NAME = 'seleneSearchCode'
export const PROJECT_SELENE_INSTRUCTIONS =
  'For questions about Project Selene, use the dedicated Selene tools instead of general web search. Search or list files once to locate relevant implementation, then read the most relevant files rather than repeating discovery calls. Stop researching once you have enough evidence to answer. Cite the commit-pinned GitHub URLs returned by the tools and distinguish behavior shown by the source from your own inference. Never use these tools or discuss Project Selene outside the designated operations channel.'

const OWNER = 'Project-Selene'
const REPOSITORY = 'Project-Selene'
const DEFAULT_BRANCH = 'master'
const API_BASE_URL = 'https://api.github.com'
const MAX_READ_LINES = 300

const ListFilesArgsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().describe('Maximum files to return.'),
  path: z
    .string()
    .optional()
    .describe('Optional repository directory or path prefix, without a leading slash.')
})

const ReadFileArgsSchema = z.object({
  endLine: z.number().int().positive().optional().describe('Inclusive ending line number.'),
  path: z.string().min(1).describe('Exact repository file path, without a leading slash.'),
  startLine: z.number().int().positive().optional().describe('Inclusive starting line number.')
})

const SearchCodeArgsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().describe('Maximum matching files to return.'),
  path: z
    .string()
    .optional()
    .describe('Optional repository directory or path prefix to restrict the search.'),
  query: z.string().min(1).describe('Code, symbol, filename, or concept to search for.')
})

export function createProjectSeleneTools(config: ProjectSeleneConfig = {}): ToolSet {
  const repository = new ProjectSeleneRepository(config)
  return {
    [PROJECT_SELENE_LIST_FILES_TOOL_NAME]: tool({
      description:
        'List files in the public Project-Selene/Project-Selene repository. Use this to explore its C#, TypeScript, modloader, UI, backend, and migration structure before reading files. Results cite the exact repository commit.',
      execute: async (args) => repository.listFiles(args),
      inputSchema: ListFilesArgsSchema,
      outputSchema: z.string(),
      toModelOutput: textOutput
    }),
    [PROJECT_SELENE_READ_FILE_TOOL_NAME]: tool({
      description:
        'Read an exact file or line range from Project-Selene/Project-Selene. Use paths discovered through Selene List Files or Selene Search Code. The result includes a commit-pinned GitHub citation.',
      execute: async (args) => repository.readFile(args),
      inputSchema: ReadFileArgsSchema,
      outputSchema: z.string(),
      toModelOutput: textOutput
    }),
    [PROJECT_SELENE_SEARCH_CODE_TOOL_NAME]: tool({
      description:
        'Search code and filenames in Project-Selene/Project-Selene. Use this for questions about Selene implementation, architecture, behavior, APIs, and symbols, then read the most relevant files. Requires GITHUB_TOKEN to be configured.',
      execute: async (args) => repository.searchCode(args),
      inputSchema: SearchCodeArgsSchema,
      outputSchema: z.string(),
      toModelOutput: textOutput
    })
  }
}

export class ProjectSeleneRepository {
  readonly #fetch: typeof fetch
  readonly #token: string | undefined
  #commitPromise: Promise<string> | undefined
  #treePromise: Promise<GitHubTreeResponse> | undefined

  constructor(config: ProjectSeleneConfig = {}) {
    this.#fetch = config.fetch ?? fetch
    this.#token = config.token
  }

  async listFiles(args: z.infer<typeof ListFilesArgsSchema>): Promise<string> {
    const path = normalizeOptionalPath(args.path)
    const limit = args.limit ?? 100
    const [commit, tree] = await Promise.all([this.#commit(), this.#tree()])
    const matchingFiles = tree.tree.filter(
      (entry) => entry.type === 'blob' && (path === undefined || matchesPath(entry.path, path))
    )
    const files = matchingFiles.slice(0, limit)

    if (files.length === 0) {
      return `No Project Selene files found under ${path ?? 'the repository root'}.`
    }

    const lines = files.map((entry) => {
      const size = entry.size === undefined ? '' : ` (${entry.size} bytes)`
      return `- ${entry.path}${size}`
    })
    const remaining = matchingFiles.length - files.length
    return [
      `[Project Selene files at ${commit}]`,
      `Source: ${treeUrl(commit)}`,
      '',
      ...lines,
      ...(remaining > 0 ? [`- … ${remaining} more files; narrow the path or raise the limit.`] : [])
    ].join('\n')
  }

  async readFile(args: z.infer<typeof ReadFileArgsSchema>): Promise<string> {
    const path = normalizePath(args.path)
    const startLine = args.startLine ?? 1
    const requestedEnd = args.endLine ?? startLine + MAX_READ_LINES - 1
    if (requestedEnd < startLine) {
      throw new Error('Selene read endLine cannot be before startLine.')
    }
    if (requestedEnd - startLine + 1 > MAX_READ_LINES) {
      throw new Error(`Selene read is limited to ${MAX_READ_LINES} lines per call.`)
    }

    const commit = await this.#commit()
    const content = await this.#requestText(rawFileUrl(commit, path))
    const allLines = content.split(/\r?\n/u)
    if (startLine > allLines.length) {
      throw new Error(`Selene file ${path} has only ${allLines.length} lines.`)
    }
    const endLine = Math.min(requestedEnd, allLines.length)
    const selected = allLines
      .slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`)

    return [
      `[Project Selene file: ${path}]`,
      `Source: ${blobUrl(commit, path, startLine, endLine)}`,
      '',
      ...selected
    ].join('\n')
  }

  async searchCode(args: z.infer<typeof SearchCodeArgsSchema>): Promise<string> {
    if (this.#token === undefined || this.#token.length === 0) {
      throw new Error('Selene code search requires GITHUB_TOKEN to be configured.')
    }
    const path = normalizeOptionalPath(args.path)
    const limit = args.limit ?? 10
    const query = [`${args.query.trim()} repo:${OWNER}/${REPOSITORY}`, path && `path:${path}`]
      .filter(Boolean)
      .join(' ')
    const search = await this.#requestJson(
      `${API_BASE_URL}/search/code?q=${encodeURIComponent(query)}&per_page=${limit}`,
      GitHubCodeSearchResponseSchema,
      'application/vnd.github.text-match+json'
    )
    const commit = await this.#commit()
    if (search.items.length === 0) {
      return `No Project Selene code matched ${JSON.stringify(args.query)}.`
    }

    return [
      `[Project Selene code search: ${args.query}]`,
      `Commit: ${commit}`,
      '',
      ...search.items.flatMap((item) => {
        const fragments = item.text_matches
          ?.map((match) => match.fragment.trim())
          .filter((fragment) => fragment.length > 0)
          .slice(0, 2)
        return [
          `- ${item.path}: ${blobUrl(commit, item.path)}`,
          ...(fragments ?? []).map((fragment) => indentExcerpt(fragment))
        ]
      }),
      ...(search.total_count > search.items.length
        ? [`- ${search.total_count - search.items.length} additional matches not shown.`]
        : [])
    ].join('\n')
  }

  async #commit(): Promise<string> {
    this.#commitPromise ??= this.#requestJson(
      `${API_BASE_URL}/repos/${OWNER}/${REPOSITORY}/commits/${DEFAULT_BRANCH}`,
      GitHubCommitResponseSchema
    )
      .then((response) => response.sha)
      .catch((error: unknown) => {
        this.#commitPromise = undefined
        throw error
      })
    return this.#commitPromise
  }

  async #tree(): Promise<GitHubTreeResponse> {
    this.#treePromise ??= this.#commit()
      .then(async (commit) => {
        const tree = await this.#requestJson(
          `${API_BASE_URL}/repos/${OWNER}/${REPOSITORY}/git/trees/${commit}?recursive=1`,
          GitHubTreeResponseSchema
        )
        if (tree.truncated) {
          throw new Error('GitHub returned a truncated Project Selene repository tree.')
        }
        return tree
      })
      .catch((error: unknown) => {
        this.#treePromise = undefined
        throw error
      })
    return this.#treePromise
  }

  async #requestJson<T>(
    url: string,
    schema: z.ZodType<T>,
    accept = 'application/vnd.github+json'
  ): Promise<T> {
    const response = await this.#fetch(url, { headers: this.#headers(accept) })
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status} ${response.statusText}).`)
    }
    const payload: unknown = await response.json()
    return schema.parse(payload)
  }

  async #requestText(url: string): Promise<string> {
    const response = await this.#fetch(url, { headers: this.#headers('text/plain') })
    if (!response.ok) {
      throw new Error(`GitHub file request failed (${response.status} ${response.statusText}).`)
    }
    return response.text()
  }

  #headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      ...(this.#token === undefined ? {} : { Authorization: `Bearer ${this.#token}` }),
      'User-Agent': 'kanikou',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }
}

function textOutput({ output }: { output: string }) {
  return { type: 'text' as const, value: output }
}

function normalizeOptionalPath(path: string | undefined): string | undefined {
  return path === undefined || path.trim().length === 0 ? undefined : normalizePath(path)
}

function normalizePath(path: string): string {
  const normalized = path
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/gu, '')
  if (normalized.length === 0 || normalized.split('/').includes('..')) {
    throw new Error('Invalid Project Selene repository path.')
  }
  return normalized
}

function matchesPath(candidate: string, path: string): boolean {
  return candidate === path || candidate.startsWith(`${path}/`)
}

function rawFileUrl(commit: string, path: string): string {
  return `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${commit}/${encodePath(path)}`
}

function treeUrl(commit: string): string {
  return `https://github.com/${OWNER}/${REPOSITORY}/tree/${commit}`
}

function blobUrl(commit: string, path: string, startLine?: number, endLine?: number): string {
  const lines =
    startLine === undefined
      ? ''
      : `#L${startLine}${endLine === undefined || endLine === startLine ? '' : `-L${endLine}`}`
  return `https://github.com/${OWNER}/${REPOSITORY}/blob/${commit}/${encodePath(path)}${lines}`
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function indentExcerpt(fragment: string): string {
  const excerpt = fragment.length > 1_000 ? `${fragment.slice(0, 1_000)}…` : fragment
  return excerpt
    .split(/\r?\n/u)
    .map((line) => `    ${line}`)
    .join('\n')
}
