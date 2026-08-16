import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { asSchema, jsonSchema, type ToolSet } from 'ai'
import { OPERATIONS_CHANNEL_ID, OPERATIONS_GUILD_ID } from '../discord/ids.ts'
import { MintlifyFileOAuthProvider } from './mintlify-oauth.ts'
import type {
  MintlifyMcpConfig,
  MintlifySession,
  OperationsToolProviderConfig,
  ScopedToolProvider,
  ScopedToolSet,
  ToolScope
} from './mintlify-mcp-types.ts'

const MINTLIFY_MCP_URL = 'https://mcp.mintlify.com'
const OPERATIONS_INSTRUCTIONS = `You are helping with documentation operations in the designated operations channel. The docs_* tools can read and modify the connected documentation project. Call docs_list_deployments when the target deployment is unclear, and call docs_checkout before branch-backed reads or edits. Keep each change focused. After making edits, call docs_diff and show the user the resulting file changes, including the relevant patch content, before asking whether to save them. Never call docs_save unless the user explicitly approves saving after seeing that diff; an initial request to edit documentation is not approval to save. After approval, default docs_save to opening a pull request unless the user explicitly requests an existing PR branch. Never use these tools outside this channel.`

export type {
  MintlifyMcpConfig,
  OperationsToolProviderConfig,
  ScopedToolProvider,
  ScopedToolSet,
  ToolScope
} from './mintlify-mcp-types.ts'

export class OperationsToolProvider implements ScopedToolProvider {
  readonly #config: OperationsToolProviderConfig

  constructor(config: OperationsToolProviderConfig) {
    this.#config = config
  }

  async resolve(scope: ToolScope): Promise<ScopedToolSet> {
    if (!isOperationsScope(scope)) {
      return { tools: {} }
    }
    const provided = (await this.#config.provider?.resolve(scope)) ?? { tools: {} }
    return {
      instructions: [provided.instructions, this.#config.instructions]
        .filter((value) => value !== undefined && value.length > 0)
        .join('\n\n'),
      maxToolIterations: null,
      tools: { ...provided.tools, ...this.#config.tools }
    }
  }
}

export class MintlifyMcpToolProvider implements ScopedToolProvider {
  readonly #config: MintlifyMcpConfig
  #sessionPromise: Promise<MintlifySession> | undefined

  constructor(config: MintlifyMcpConfig) {
    this.#config = config
  }

  async resolve(scope: ToolScope): Promise<ScopedToolSet> {
    if (!isOperationsScope(scope)) {
      return { tools: {} }
    }

    const session = await this.#session()
    return {
      instructions: [OPERATIONS_INSTRUCTIONS, session.client.instructions]
        .filter((value) => value !== undefined && value.length > 0)
        .join('\n\n'),
      tools: session.tools
    }
  }

  async close(): Promise<void> {
    const sessionPromise = this.#sessionPromise
    this.#sessionPromise = undefined
    if (sessionPromise !== undefined) {
      const session = await sessionPromise
      await session.client.close()
    }
  }

  async #session(): Promise<MintlifySession> {
    this.#sessionPromise ??= this.#createSession().catch((error: unknown) => {
      this.#sessionPromise = undefined
      throw error
    })
    return this.#sessionPromise
  }

  async #createSession(): Promise<MintlifySession> {
    const client =
      this.#config.createClient === undefined
        ? await createMintlifyClient(this.#config)
        : await this.#config.createClient()
    try {
      return {
        client,
        tools: await namespaceTools(await client.tools())
      }
    } catch (error) {
      await client.close()
      throw error
    }
  }
}

export function isOperationsScope(scope: Pick<ToolScope, 'channelID' | 'guildID'>): boolean {
  return scope.guildID === OPERATIONS_GUILD_ID && scope.channelID === OPERATIONS_CHANNEL_ID
}

async function createMintlifyClient(config: MintlifyMcpConfig): Promise<MCPClient> {
  if (config.oauthFile === undefined) {
    throw new Error('Mintlify MCP requires an OAuth credential file.')
  }
  return createMCPClient({
    clientName: 'kanikou',
    maxRetries: 0,
    onUncaughtError: config.onError,
    transport: {
      authProvider: new MintlifyFileOAuthProvider(config.oauthFile),
      type: 'http',
      url: MINTLIFY_MCP_URL
    }
  })
}

async function namespaceTools(tools: ToolSet): Promise<ToolSet> {
  const entries = Object.entries(tools)
  const resolved = await Promise.all(
    entries.map(async ([name, mcpTool]) => {
      const toolName = `docs_${name.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}`
      const inputSchema = asSchema(mcpTool.inputSchema)
      return {
        toolName,
        mcpTool,
        inputSchema,
        resolvedSchema: await inputSchema.jsonSchema
      }
    })
  )

  const namespaced: ToolSet = {}
  for (const { toolName, mcpTool, inputSchema, resolvedSchema } of resolved) {
    if (Object.hasOwn(namespaced, toolName)) {
      throw new Error(`Mintlify MCP tool name collision for ${toolName}.`)
    }
    namespaced[toolName] = {
      ...mcpTool,
      inputSchema: jsonSchema(geminiCompatibleSchema(resolvedSchema), {
        validate: inputSchema.validate
      })
    }
  }
  return namespaced
}

function geminiCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(geminiCompatibleSchema)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }

  const compatible: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'const' && typeof child !== 'string') {
      continue
    }
    if (
      key === 'enum' &&
      Array.isArray(child) &&
      child.some((enumValue) => typeof enumValue !== 'string')
    ) {
      continue
    }
    compatible[key] = geminiCompatibleSchema(child)
  }
  return compatible
}
