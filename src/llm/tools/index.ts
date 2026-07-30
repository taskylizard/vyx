import type { ToolSet } from 'ai'
import type { ParallelToolsConfig } from './parallel-config.ts'
import { createProjectSeleneTools, type ProjectSeleneConfig } from './project-selene.ts'
import { createParallelExtractTool, PARALLEL_EXTRACT_TOOL_NAME } from './parallel-extract.ts'
import { createParallelSearchTool, PARALLEL_SEARCH_TOOL_NAME } from './parallel-search.ts'
import {
  createSupadataTranscriptTool,
  SUPADATA_TRANSCRIPT_TOOL_NAME,
  type SupadataTranscriptConfig
} from './supadata-transcript.ts'
import { withToolRecovery } from './tool-recovery.ts'

export interface KanikouToolsConfig {
  parallel?: ParallelToolsConfig
  projectSelene?: ProjectSeleneConfig
  supadata?: SupadataTranscriptConfig
}

export function createKanikouTools(config: KanikouToolsConfig): ToolSet {
  const tools: ToolSet = {}

  if (config.parallel !== undefined) {
    tools[PARALLEL_SEARCH_TOOL_NAME] = withToolRecovery(createParallelSearchTool(config.parallel))
    tools[PARALLEL_EXTRACT_TOOL_NAME] = withToolRecovery(createParallelExtractTool(config.parallel))
  }

  if (config.projectSelene !== undefined) {
    Object.assign(tools, createProjectSeleneTools(config.projectSelene))
  }

  if (config.supadata !== undefined) {
    tools[SUPADATA_TRANSCRIPT_TOOL_NAME] = withToolRecovery(
      createSupadataTranscriptTool(config.supadata)
    )
  }

  return tools
}

/** @deprecated Use createKanikouTools. */
export { createKanikouTools as createSearchTools }

/** @deprecated Use KanikouToolsConfig. */
export { type KanikouToolsConfig as SearchToolsConfig }

export { createParallelExtractTool, PARALLEL_EXTRACT_TOOL_NAME } from './parallel-extract.ts'
export { createParallelSearchTool, PARALLEL_SEARCH_TOOL_NAME } from './parallel-search.ts'
export {
  createMemoryTools,
  FORGET_TOOL_NAME,
  LIST_MEMORIES_TOOL_NAME,
  MEMORY_LIST_MAX_LENGTH,
  MEMORY_TOOL_PREVIEW_MAX_LENGTH,
  MEMORY_TOOLS_INSTRUCTIONS,
  MemoryToolProvider,
  REMEMBER_TOOL_NAME,
  type MemoryToolProviderConfig
} from './memory.ts'
export {
  createProjectSeleneTools,
  PROJECT_SELENE_LIST_FILES_TOOL_NAME,
  PROJECT_SELENE_READ_FILE_TOOL_NAME,
  PROJECT_SELENE_SEARCH_CODE_TOOL_NAME,
  PROJECT_SELENE_INSTRUCTIONS,
  ProjectSeleneRepository,
  type ProjectSeleneConfig
} from './project-selene.ts'
export type { ParallelToolsConfig } from './parallel-config.ts'
export {
  createSupadataTranscriptTool,
  executeSupadataTranscript,
  SUPADATA_TRANSCRIPT_TOOL_NAME,
  type SupadataTranscriptArgs,
  type SupadataTranscriptClient,
  type SupadataTranscriptConfig
} from './supadata-transcript.ts'
export { isTransientToolError, withToolRecovery, type ToolRecoveryConfig } from './tool-recovery.ts'
export { toolActivityLabel } from './tool-labels.ts'
