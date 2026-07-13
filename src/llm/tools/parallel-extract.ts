import { createExtractTool } from '@parallel-web/ai-sdk-tools'
import type { Tool } from 'ai'
import { KANIKOU_MODEL } from '../../config/model.ts'
import type { ParallelToolsConfig } from './parallel-config.ts'

export const PARALLEL_EXTRACT_TOOL_NAME = 'extract'

export function createParallelExtractTool(config: ParallelToolsConfig): Tool {
  return createExtractTool({
    apiKey: config.apiKey,
    client_model: KANIKOU_MODEL,
    description:
      'Extract focused content from specific web URLs. Use this after search when excerpts are not detailed enough, and cite the extracted URLs.'
  })
}
