import { toolActivityLabel } from './tools/tool-labels.ts'

export const THINKING_RESPONSE = '*Thinking...*'

export function formatThinkingProgress(toolNames: readonly string[]): string {
  return appendToolSummary(THINKING_RESPONSE, toolNames)
}

export function formatCompletedResponse(content: string, toolNames: readonly string[]): string {
  return appendToolSummary(content, toolNames)
}

function appendToolSummary(content: string, toolNames: readonly string[]): string {
  if (toolNames.length === 0) {
    return content
  }

  return `${content}\n-# Tools: ${compactToolNames(toolNames).join(', ')}`
}

function compactToolNames(toolNames: readonly string[]): string[] {
  const toolRuns: { count: number; name: string }[] = []

  for (const toolName of toolNames) {
    const previousRun = toolRuns.at(-1)
    if (previousRun?.name === toolName) {
      previousRun.count += 1
      continue
    }

    toolRuns.push({ count: 1, name: toolName })
  }

  return toolRuns.map(({ count, name }) => {
    const label = toolActivityLabel(name)
    return count === 1 ? label : `${label} (x${count})`
  })
}
