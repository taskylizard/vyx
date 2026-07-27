import { afterEach, expect, test, vi } from 'vite-plus/test'
import { startJumbleTyping } from '../../src/jumble/typing.ts'

afterEach(() => {
  vi.useRealTimers()
})

test('polls typing immediately without overlapping requests and stops cleanly', async () => {
  vi.useFakeTimers()
  let finishTyping!: () => void
  const pendingTyping = new Promise<void>((resolve) => {
    finishTyping = resolve
  })
  const sendTyping = vi.fn(async () => pendingTyping)
  const stop = startJumbleTyping({ rest: { channels: { sendTyping } } }, 'channel-1', 1_000)

  expect(sendTyping).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(3_000)
  expect(sendTyping).toHaveBeenCalledOnce()

  finishTyping()
  await pendingTyping
  await vi.advanceTimersByTimeAsync(1_000)
  expect(sendTyping).toHaveBeenCalledTimes(2)

  stop()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(sendTyping).toHaveBeenCalledTimes(2)
})

test('stops polling after Discord rejects a typing request', async () => {
  vi.useFakeTimers()
  const sendTyping = vi.fn(async () => Promise.reject(new Error('missing permission')))
  startJumbleTyping({ rest: { channels: { sendTyping } } }, 'channel-1', 1_000)

  vi.runAllTicks()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(sendTyping).toHaveBeenCalledOnce()
})
