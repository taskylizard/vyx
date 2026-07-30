import type { ToolSet } from 'ai'

export interface ToolScope {
  channelID: string
  guildID: string | null
}

export interface ScopedToolSet {
  instructions?: string
  tools: ToolSet
}

export interface ScopedToolProvider {
  resolve(scope: ToolScope): Promise<ScopedToolSet>
}

export interface MintlifyMcpClient {
  readonly instructions?: string
  close(): Promise<void>
  tools(): Promise<ToolSet>
}

export interface MintlifyMcpConfig {
  createClient?: () => Promise<MintlifyMcpClient>
  oauthFile?: string
  onError?: (error: unknown) => void
}

export interface OperationsToolProviderConfig {
  instructions?: string
  provider?: ScopedToolProvider
  tools?: ToolSet
}

export interface MintlifySession {
  client: MintlifyMcpClient
  tools: ToolSet
}
