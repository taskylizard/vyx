import { tool } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { z } from 'zod'
import { withToolRecovery } from '../../src/llm/tools/tool-recovery.ts'

test('retries transient tool failures with exponential delays', async () => {
  const execute = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
    .mockResolvedValue('recovered')
  const sleep = vi.fn(async () => undefined)
  const recoveredTool = withToolRecovery(
    tool({
      execute,
      inputSchema: z.object({})
    }),
    { retryDelayMs: 10, sleep }
  )
  if (recoveredTool.execute === undefined) {
    throw new Error('Recovered tool is not executable.')
  }

  const output = await recoveredTool.execute(
    {},
    { context: {}, messages: [], toolCallId: 'recovery-call' }
  )

  expect(output).toBe('recovered')
  expect(execute).toHaveBeenCalledTimes(3)
  expect(sleep).toHaveBeenNthCalledWith(1, 10)
  expect(sleep).toHaveBeenNthCalledWith(2, 20)
})

test('does not retry permanent tool failures', async () => {
  const execute = vi.fn(async (): Promise<string> => {
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  })
  const sleep = vi.fn(async () => undefined)
  const recoveredTool = withToolRecovery(
    tool({
      execute,
      inputSchema: z.object({})
    }),
    { sleep }
  )
  if (recoveredTool.execute === undefined) {
    throw new Error('Recovered tool is not executable.')
  }

  await expect(
    recoveredTool.execute({}, { context: {}, messages: [], toolCallId: 'permanent-failure-call' })
  ).rejects.toThrow('unauthorized')
  expect(execute).toHaveBeenCalledOnce()
  expect(sleep).not.toHaveBeenCalled()
})
