import { createSearchTool } from '@parallel-web/ai-sdk-tools'
import type { Tool } from 'ai'
import { KANIKOU_MODEL } from '../../config/model.ts'
import type { ParallelToolsConfig } from './parallel-config.ts'

export const PARALLEL_SEARCH_TOOL_NAME = 'search'

export function createParallelSearchTool(config: ParallelToolsConfig): Tool {
  return createSearchTool({
    apiKey: config.apiKey,
    client_model: KANIKOU_MODEL,
    description:
      'Search the web for high-quality, compressed research. Use focused queries and cite the URLs in the returned results.',
    mode: 'advanced'
  })
}
