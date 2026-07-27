import type { Tool } from 'ai'

const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 250

export interface ToolRecoveryConfig {
  maxRetries?: number
  retryDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

export function withToolRecovery(tool: Tool, config: ToolRecoveryConfig = {}): Tool {
  const execute = tool.execute
  if (execute === undefined) {
    return tool
  }

  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  if (maxRetries < 0 || !Number.isInteger(maxRetries)) {
    throw new Error('Tool recovery maxRetries must be a non-negative integer.')
  }
  if (retryDelayMs < 0) {
    throw new Error('Tool recovery retryDelayMs cannot be negative.')
  }

  return {
    ...tool,
    execute: async (input, options) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop -- tasky: sequential retry, each attempt must observe the previous failure
          return await execute(input, options)
        } catch (error) {
          if (attempt >= maxRetries || !isTransientToolError(error)) {
            throw error
          }

          const sleep = config.sleep ?? defaultSleep
          // eslint-disable-next-line no-await-in-loop -- tasky: sequential retry, backoff delay before the next attempt
          await sleep(retryDelayMs * 2 ** attempt)
        }
      }
    }
  }
}

export function isTransientToolError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const status = 'status' in error ? error.status : undefined
  if (typeof status === 'number') {
    return status === 408 || status === 425 || status === 429 || status >= 500
  }

  const providerError = 'error' in error ? error.error : undefined
  if (providerError === 'internal-error') {
    return true
  }
  if (error instanceof TypeError) {
    return true
  }

  const message = error instanceof Error ? error.message : ''
  return /ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up|timed out/i.test(message)
}

async function defaultSleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
