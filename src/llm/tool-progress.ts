import { toolActivityLabel } from './tools/tool-labels.ts'

export const THINKING_RESPONSE = '*Thinking...*'

// tasky: the footer is kanikou UI chrome; strip echoed or previously-appended copies
// (including consecutive ones) before formatting, so the rendered footer never repeats
const TOOLS_FOOTER_PATTERN = /(?:^|\r?\n)(?:-# Tools: [^\r\n]*\r?\n?)+$/u

export function stripToolsFooter(content: string): string {
  return content.replace(TOOLS_FOOTER_PATTERN, '')
}

export function formatThinkingProgress(toolNames: readonly string[]): string {
  return formatCompletedResponse(THINKING_RESPONSE, toolNames)
}

export function formatCompletedResponse(content: string, toolNames: readonly string[]): string {
  if (toolNames.length === 0) {
    return content
  }

  return `${stripToolsFooter(content)}\n-# Tools: ${compactToolNames(toolNames).join(', ')}`
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
