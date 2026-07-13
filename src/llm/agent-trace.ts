import type { Logger } from 'tracix'

interface BaseAgentTraceEvent {
  event: string
  traceId: string
}

export type AgentTraceEvent = BaseAgentTraceEvent &
  (
    | {
        durationMs?: number
        error?: string
        event: 'generation.error' | 'generation.end' | 'generation.start'
        messageCount?: number
      }
    | {
        callId: string
        durationMs?: number
        event: 'step.end' | 'step.start'
        finishReason?: string
        inputTokens?: number
        modelId?: string
        outputTokens?: number
        provider?: string
        responseTimeMs?: number
        stepNumber: number
        totalTokens?: number
      }
    | {
        callId: string
        durationMs?: number
        error?: string
        event: 'tool.end' | 'tool.start'
        outcome?: 'error' | 'success'
        toolCallId: string
        toolName: string
      }
  )

export function logAgentTrace(logger: Logger, event: AgentTraceEvent): void {
  const message = `[agent-trace] ${JSON.stringify(event)}`
  if (event.event === 'generation.error') {
    logger.error(message)
    return
  }
  if (event.event === 'tool.end' && event.outcome === 'error') {
    logger.warn(message)
    return
  }

  logger.debug(message)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
