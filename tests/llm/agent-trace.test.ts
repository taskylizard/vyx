import { expect, test, vi } from 'vite-plus/test'
import { errorMessage, logAgentTrace } from '../../src/llm/agent-trace.ts'
import type { KanikouLogger } from '../../src/observability/types.ts'

test('logs successful trace events at debug level', () => {
  const { debug, error, logger, warn } = createLogger()

  logAgentTrace(logger, {
    callId: 'call-1',
    durationMs: 42,
    event: 'tool.end',
    outcome: 'success',
    toolCallId: 'tool-call-1',
    toolName: 'search',
    traceId: 'trace-1'
  })

  expect(debug).toHaveBeenCalledWith('agent trace', expect.objectContaining({ durationMs: 42 }))
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test('raises failed tool and generation traces to visible log levels', () => {
  const { error, logger, warn } = createLogger()

  logAgentTrace(logger, {
    callId: 'call-1',
    durationMs: 12,
    error: 'upstream unavailable',
    event: 'tool.end',
    outcome: 'error',
    toolCallId: 'tool-call-1',
    toolName: 'search',
    traceId: 'trace-1'
  })
  logAgentTrace(logger, {
    durationMs: 20,
    error: 'model unavailable',
    event: 'generation.error',
    traceId: 'trace-1'
  })

  expect(warn).toHaveBeenCalledOnce()
  expect(error).toHaveBeenCalledOnce()
  expect(errorMessage(new Error('safe message'))).toBe('safe message')
})

function createLogger() {
  const debug = vi.fn()
  const error = vi.fn()
  const info = vi.fn()
  const trace = vi.fn()
  const warn = vi.fn()
  const logger = { debug, error, info, trace, warn } satisfies KanikouLogger
  return {
    debug,
    error,
    logger,
    warn
  }
}
