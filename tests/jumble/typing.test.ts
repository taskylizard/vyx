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
  const cachedSendTyping = vi.fn(async () => pendingTyping)
  const restSendTyping = vi.fn(async () => undefined)
  const stop = startJumbleTyping(
    {
      getChannel: vi.fn(() => ({ sendTyping: cachedSendTyping })),
      rest: { channels: { sendTyping: restSendTyping } }
    } as never,
    'channel-1',
    1_000
  )

  expect(cachedSendTyping).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(3_000)
  expect(cachedSendTyping).toHaveBeenCalledOnce()

  finishTyping()
  await pendingTyping
  await vi.advanceTimersByTimeAsync(1_000)
  expect(cachedSendTyping).toHaveBeenCalledTimes(2)
  expect(restSendTyping).not.toHaveBeenCalled()

  stop()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(cachedSendTyping).toHaveBeenCalledTimes(2)
})

test('falls back to REST when cached typing fails', async () => {
  vi.useFakeTimers()
  const cachedSendTyping = vi.fn(() => Promise.reject(new Error('stale channel')))
  const restSendTyping = vi.fn(async () => undefined)
  const stop = startJumbleTyping(
    {
      getChannel: vi.fn(() => ({ sendTyping: cachedSendTyping })),
      rest: { channels: { sendTyping: restSendTyping } }
    } as never,
    'channel-1',
    1_000
  )

  await vi.advanceTimersByTimeAsync(0)
  expect(cachedSendTyping).toHaveBeenCalledOnce()
  expect(restSendTyping).toHaveBeenCalledWith('channel-1')
  stop()
})

test('uses REST when the channel is not cached', async () => {
  vi.useFakeTimers()
  const restSendTyping = vi.fn(async () => undefined)
  const stop = startJumbleTyping(
    {
      getChannel: vi.fn(() => undefined),
      rest: { channels: { sendTyping: restSendTyping } }
    } as never,
    'channel-1',
    1_000
  )

  await vi.advanceTimersByTimeAsync(0)
  expect(restSendTyping).toHaveBeenCalledWith('channel-1')
  stop()
})

test('stops polling after cached and REST typing both fail', async () => {
  vi.useFakeTimers()
  const cachedSendTyping = vi.fn(() => Promise.reject(new Error('stale channel')))
  const restSendTyping = vi.fn(() => Promise.reject(new Error('missing permission')))
  startJumbleTyping(
    {
      getChannel: vi.fn(() => ({ sendTyping: cachedSendTyping })),
      rest: { channels: { sendTyping: restSendTyping } }
    } as never,
    'channel-1',
    1_000
  )

  vi.runAllTicks()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(cachedSendTyping).toHaveBeenCalledOnce()
  expect(restSendTyping).toHaveBeenCalledOnce()
})
