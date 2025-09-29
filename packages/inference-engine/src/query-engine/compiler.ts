import { Document } from 'llamaindex'
import { logger } from '../logger'
import { MarkdownReader } from './markdown-reader'

export interface GitHubRepo {
  owner: string
  repo: string
  path?: string
}

interface GitHubFile {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
}

async function fetchFiles(
  owner: string,
  repo: string,
  path: string = '',
  allDocuments: Document[] = []
): Promise<Document[]> {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents${
      path ? `/${path}` : ''
    }`

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'vyx-query-engine'
    }

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const response = await fetch(apiUrl, { headers })

    if (!response.ok) {
      logger.warn(
        `Failed to fetch from ${owner}/${repo}${
          path ? `/${path}` : ''
        }: ${response.status}`
      )
      return allDocuments
    }

    const data = await response.json()
    const files = Array.isArray(data)
      ? (data as GitHubFile[])
      : [data as GitHubFile]

    // Separate files and directories
    const markdownFiles = files.filter(
      (file) => file.type === 'file' && file.name.endsWith('.md')
    )
    const directories = files.filter(
      (file) => file.type === 'dir' && !file.name.startsWith('.')
    )

    // Fetch markdown files in current directory and create Documents
    if (markdownFiles.length > 0) {
      logger.log(
        `Fetching ${markdownFiles.length} files from ${owner}/${repo}${
          path ? `/${path}` : ''
        }: ${markdownFiles.map((f) => f.name).join(', ')}`
      )

      for (const file of markdownFiles) {
        if (file.download_url) {
          try {
            const fileHeaders: Record<string, string> = {
              'User-Agent': 'vyx-query-engine'
            }

            if (process.env.GITHUB_TOKEN) {
              fileHeaders['Authorization'] =
                `Bearer ${process.env.GITHUB_TOKEN}`
            }

            const fileResponse = await fetch(file.download_url, {
              headers: fileHeaders
            })
            if (fileResponse.ok) {
              const content = await fileResponse.text()

              // Create Document with proper metadata
              const document = new Document({
                text: content,
                id_: `${owner}/${repo}/${file.path}`,
                metadata: {
                  source: `${owner}/${repo}/${file.path}`,
                  repository: `${owner}/${repo}`,
                  filename: file.name,
                  path: file.path,
                  owner,
                  repo
                }
              })

              allDocuments.push(document)
            } else {
              logger.warn(
                `Failed to download ${file.name}: ${fileResponse.status}`
              )
            }
          } catch (error) {
            logger.warn(`Failed to fetch file ${file.path}: ${error}`)
          }
        }
      }
    }

    // Recursively fetch from subdirectories (ignore dot directories)
    for (const dir of directories) {
      await fetchFiles(
        owner,
        repo,
        dir.path,
        allDocuments
      )
    }
  } catch (error) {
    logger.warn(
      `Error fetching from ${owner}/${repo}${path ? `/${path}` : ''}: ${error}`
    )
  }

  return allDocuments
}

export async function compileToDocuments(
  githubRepos: GitHubRepo[]
): Promise<Document[]> {
  const allDocuments: Document[] = []

  for (const { owner, repo, path: repoPath } of githubRepos) {
    const repoDocuments = await fetchFiles(
      owner,
      repo,
      repoPath,
      []
    )

    // Process each document through MarkdownReader to split into chunks
    const markdownReader = new MarkdownReader()
    for (const doc of repoDocuments) {
      const processedDocs = await markdownReader.loadDataFromContent(doc.text)

      // Add original metadata to processed documents
      processedDocs.forEach((processedDoc, index) => {
        processedDoc.id_ = `${doc.id_}_chunk_${index}`
        processedDoc.metadata = {
          ...doc.metadata,
          chunkIndex: index,
          originalDocId: doc.id_
        }
      })

      allDocuments.push(...processedDocs)
    }
  }

  logger.log(
    `Compiled ${allDocuments.length} document chunks from ${githubRepos.length} repositories`
  )
  return allDocuments
}
