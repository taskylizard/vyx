import {
  generateText,
  isStepCount,
  type FinishReason,
  type LanguageModel,
  type ModelMessage,
  type ToolSet
} from 'ai'
import { match } from 'ts-pattern'
import { KANIKOU_MODEL_SETTINGS } from '../config/model.ts'
import { kanikouSystemPrompt } from '../config/system-prompt.ts'
import { formatCitations } from './citations.ts'
import { suppressLinkEmbeds } from './links.ts'

const DEFAULT_MAX_TOOL_ITERATIONS = 6

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

export interface GenerationToolEndEvent extends GenerationToolStartEvent {
  durationMs: number
  error?: string
  outcome: 'error' | 'success'
}

export async function generateKanikouResponse(
  model: LanguageModel,
  messages: ModelMessage[],
  tools: ToolSet,
  hooks: GenerationHooks = {}
): Promise<string> {
  const maxToolIterations =
    hooks.maxToolIterations === undefined ? DEFAULT_MAX_TOOL_ITERATIONS : hooks.maxToolIterations
  if (
    maxToolIterations !== null &&
    (!Number.isInteger(maxToolIterations) || maxToolIterations < 2)
  ) {
    throw new Error('Tool iteration limit must be an integer of at least 2.')
  }
  const result = await generateText({
    instructions:
      hooks.instructions === undefined
        ? kanikouSystemPrompt()
        : `${kanikouSystemPrompt()}\n\n${hooks.instructions}`,
    messages,
    model,
    onStepEnd: async ({ callId, finishReason, model, performance, stepNumber, usage }) =>
      hooks.onStepEnd?.({
        callId,
        durationMs: performance.stepTimeMs,
        finishReason,
        inputTokens: usage.inputTokens,
        modelId: model.modelId,
        outputTokens: usage.outputTokens,
        provider: model.provider,
        responseTimeMs: performance.responseTimeMs,
        stepNumber,
        totalTokens: usage.totalTokens
      }),
    onStepStart: async ({ callId, modelId, provider, stepNumber }) =>
      hooks.onStepStart?.({ callId, modelId, provider, stepNumber }),
    onToolExecutionEnd: async ({ callId, toolCall, toolExecutionMs, toolOutput }) =>
      hooks.onToolExecutionEnd?.({
        callId,
        durationMs: toolExecutionMs,
        error: toolOutput.type === 'tool-error' ? errorText(toolOutput.error) : undefined,
        outcome: toolOutput.type === 'tool-error' ? 'error' : 'success',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName
      }),
    onToolExecutionStart: async ({ callId, toolCall }) =>
      hooks.onToolExecutionStart?.({
        callId,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName
      }),
    prepareStep: ({ stepNumber }) =>
      maxToolIterations !== null && stepNumber === maxToolIterations - 1
        ? { activeTools: [], toolChoice: 'none' }
        : undefined,
    stopWhen: maxToolIterations === null ? () => false : isStepCount(maxToolIterations),
    temperature: KANIKOU_MODEL_SETTINGS.temperature,
    telemetry: {
      functionId: 'kanikou.response'
    },
    toolChoice: KANIKOU_MODEL_SETTINGS.toolChoice,
    tools,
    topP: KANIKOU_MODEL_SETTINGS.topP
  })

  return completionContent(result.finishReason, result.text)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function completionContent(finishReason: FinishReason, text: string): string {
  return match(finishReason)
    .returnType<string>()
    .with('stop', 'other', () => {
      if (text.length === 0) {
        throw new Error('The model stopped without message content.')
      }
      return suppressLinkEmbeds(formatCitations(text))
    })
    .with('length', () => 'The response hit the model length limit before it finished.')
    .with(
      'content-filter',
      () => 'The model could not return that response because of a content filter.'
    )
    .with('tool-calls', () => {
      throw new Error('The model tool loop reached the iteration limit.')
    })
    .with('error', () => {
      throw new Error('The model stopped because of a provider error.')
    })
    .exhaustive()
}
