export interface ProjectSeleneConfig {
  fetch?: typeof fetch
  token?: string
}

export interface GitHubTreeResponse {
  tree: GitHubTreeEntry[]
  truncated: boolean
}

export interface GitHubTreeEntry {
  path: string
  size?: number
  type: 'blob' | 'commit' | 'tree'
}

export interface GitHubCommitResponse {
  sha: string
}

export interface GitHubCodeSearchResponse {
  items: Array<{
    path: string
    text_matches?: Array<{ fragment: string }>
  }>
  total_count: number
}
