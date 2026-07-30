import { FORGET_TOOL_NAME, LIST_MEMORIES_TOOL_NAME, REMEMBER_TOOL_NAME } from './memory.ts'
import { PARALLEL_EXTRACT_TOOL_NAME } from './parallel-extract.ts'
import { PARALLEL_SEARCH_TOOL_NAME } from './parallel-search.ts'
import { SUPADATA_TRANSCRIPT_TOOL_NAME } from './supadata-transcript.ts'

const TOOL_LABELS: Readonly<Record<string, string>> = {
  [FORGET_TOOL_NAME]: 'Forget',
  [LIST_MEMORIES_TOOL_NAME]: 'List Memories',
  [PARALLEL_EXTRACT_TOOL_NAME]: 'Extract',
  [PARALLEL_SEARCH_TOOL_NAME]: 'Search',
  [REMEMBER_TOOL_NAME]: 'Remember',
  [SUPADATA_TRANSCRIPT_TOOL_NAME]: 'YouTube Transcript'
}

export function toolActivityLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? humanizeToolName(toolName)
}

function humanizeToolName(toolName: string): string {
  const words = toolName
    .replaceAll(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_]+/g, ' ')
    .trim()
  if (words.length === 0) {
    return 'Unknown Tool'
  }

  return words[0]?.toUpperCase() + words.slice(1)
}
