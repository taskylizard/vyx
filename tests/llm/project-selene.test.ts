import { expect, test, vi } from 'vite-plus/test'
import {
  createProjectSeleneTools,
  PROJECT_SELENE_LIST_FILES_TOOL_NAME,
  PROJECT_SELENE_READ_FILE_TOOL_NAME,
  PROJECT_SELENE_SEARCH_CODE_TOOL_NAME,
  ProjectSeleneRepository
} from '../../src/llm/tools/project-selene.ts'

const commit = 'abc123def456'

test('registers all read-only Project Selene tools', () => {
  expect(Object.keys(createProjectSeleneTools())).toEqual([
    PROJECT_SELENE_LIST_FILES_TOOL_NAME,
    PROJECT_SELENE_READ_FILE_TOOL_NAME,
    PROJECT_SELENE_SEARCH_CODE_TOOL_NAME
  ])
})

test('lists files from a commit-pinned repository tree', async () => {
  const fetcher = createGitHubFetcher()
  const repository = new ProjectSeleneRepository({ fetch: fetcher })

  const output = await repository.listFiles({ path: 'ProjectSelene.Domain', limit: 10 })

  expect(output).toContain(`Project Selene files at ${commit}`)
  expect(output).toContain('ProjectSelene.Domain/Entities/Mod.cs')
  expect(output).not.toContain('README.md')
  expect(output).toContain(`/tree/${commit}`)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('reads bounded lines with a permanent GitHub citation', async () => {
  const fetcher = createGitHubFetcher()
  const repository = new ProjectSeleneRepository({ fetch: fetcher })

  const output = await repository.readFile({
    path: 'ProjectSelene.Domain/Entities/Mod.cs',
    startLine: 2,
    endLine: 3
  })

  expect(output).toContain('2: public sealed class Mod')
  expect(output).toContain('3: {')
  expect(output).toContain(`/blob/${commit}/ProjectSelene.Domain/Entities/Mod.cs#L2-L3`)
})

test('searches only the Project Selene repository with authentication', async () => {
  const fetcher = createGitHubFetcher()
  const repository = new ProjectSeleneRepository({ fetch: fetcher, token: 'github-token' })

  const output = await repository.searchCode({ query: 'ModVersion', path: 'ProjectSelene.Domain' })

  expect(output).toContain('ProjectSelene.Domain/Entities/ModVersion.cs')
  expect(output).toContain('public sealed class ModVersion')
  expect(output).toContain(`/blob/${commit}/ProjectSelene.Domain/Entities/ModVersion.cs`)
  const searchCall = fetcher.mock.calls.find(([input]) =>
    requestUrl(input).includes('/search/code')
  )
  expect(searchCall).toBeDefined()
  expect(decodeURIComponent(requestUrl(searchCall?.[0]))).toContain(
    'ModVersion repo:Project-Selene/Project-Selene path:ProjectSelene.Domain'
  )
  expect(searchCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer github-token' })
})

test('requires a token for GitHub code search', async () => {
  const repository = new ProjectSeleneRepository({ fetch: createGitHubFetcher() })

  await expect(repository.searchCode({ query: 'ModVersion' })).rejects.toThrow(
    'requires GITHUB_TOKEN'
  )
})

test('rejects traversal and oversized reads', async () => {
  const repository = new ProjectSeleneRepository({ fetch: createGitHubFetcher() })

  await expect(repository.readFile({ path: '../secret' })).rejects.toThrow('Invalid')
  await expect(
    repository.readFile({ path: 'README.md', startLine: 1, endLine: 301 })
  ).rejects.toThrow('limited to 300 lines')
})

function createGitHubFetcher() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input)
    if (url.includes('/commits/master')) {
      return Response.json({ sha: commit })
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [
          { path: 'README.md', size: 100, type: 'blob' },
          { path: 'ProjectSelene.Domain/Entities/Mod.cs', size: 200, type: 'blob' },
          { path: 'ProjectSelene.Domain/Entities/ModVersion.cs', size: 250, type: 'blob' }
        ],
        truncated: false
      })
    }
    if (url.includes('/search/code')) {
      return Response.json({
        items: [
          {
            path: 'ProjectSelene.Domain/Entities/ModVersion.cs',
            text_matches: [{ fragment: 'public sealed class ModVersion\n{\n}' }]
          }
        ],
        total_count: 1
      })
    }
    if (url.includes('raw.githubusercontent.com')) {
      return new Response('namespace ProjectSelene.Domain;\npublic sealed class Mod\n{\n}\n')
    }
    return new Response('Not found', { status: 404, statusText: 'Not Found' })
  })
}

function requestUrl(input: Parameters<typeof fetch>[0] | undefined): string {
  if (input === undefined) {
    return ''
  }
  if (input instanceof Request) {
    return input.url
  }
  return input instanceof URL ? input.href : input
}
