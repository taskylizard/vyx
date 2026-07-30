import { z } from 'zod'

export interface ProjectSeleneConfig {
  fetch?: typeof fetch
  token?: string
}

export const GitHubTreeEntrySchema = z.object({
  path: z.string(),
  size: z.number().optional(),
  type: z.enum(['blob', 'commit', 'tree'])
})

export const GitHubTreeResponseSchema = z.object({
  tree: z.array(GitHubTreeEntrySchema),
  truncated: z.boolean()
})

export const GitHubCommitResponseSchema = z.object({
  sha: z.string()
})

export const GitHubCodeSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      path: z.string(),
      text_matches: z.array(z.object({ fragment: z.string() })).optional()
    })
  ),
  total_count: z.number()
})

export type GitHubTreeEntry = z.infer<typeof GitHubTreeEntrySchema>
export type GitHubTreeResponse = z.infer<typeof GitHubTreeResponseSchema>
export type GitHubCommitResponse = z.infer<typeof GitHubCommitResponseSchema>
export type GitHubCodeSearchResponse = z.infer<typeof GitHubCodeSearchResponseSchema>
