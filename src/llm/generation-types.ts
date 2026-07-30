import type { FinishReason } from 'ai'

export interface GenerationHooks {
  instructions?: string
  maxToolIterations?: number | null
  onStepEnd?(event: GenerationStepEndEvent): void | Promise<void>
  onStepStart?(event: GenerationStepStartEvent): void | Promise<void>
  onToolExecutionEnd?(event: GenerationToolEndEvent): void | Promise<void>
  onToolExecutionStart?(event: GenerationToolStartEvent): void | Promise<void>
}

export interface GenerationStepStartEvent {
  callId: string
  modelId: string
  provider: string
  stepNumber: number
}

export interface GenerationStepEndEvent extends GenerationStepStartEvent {
  durationMs: number
  finishReason: FinishReason
  inputTokens?: number
  outputTokens?: number
  responseTimeMs: number
  totalTokens?: number
}

export interface GenerationToolStartEvent {
  callId: string
  toolCallId: string
  toolName: string
}

export type GenerationToolOutcome =
  | { error: string; outcome: 'error' }
  | { error?: never; outcome: 'success' }

export type GenerationToolEndEvent = GenerationToolStartEvent & {
  durationMs: number
} & GenerationToolOutcome
