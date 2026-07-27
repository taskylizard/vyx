import { match } from 'ts-pattern'
import { addActiveSpanEvent } from '../observability/tracing.ts'
import type { KanikouLogger } from '../observability/types.ts'

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

export function logAgentTrace(logger: KanikouLogger, event: AgentTraceEvent): void {
  const fields = { ...event }
  addActiveSpanEvent(`agent.${event.event}`, fields)

  match(event)
    .with({ event: 'generation.error' }, () => logger.error('agent generation failed', fields))
    .with({ event: 'tool.end', outcome: 'error' }, () =>
      logger.warn('agent tool execution failed', fields)
    )
    .otherwise(() => logger.debug('agent trace', fields))
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
