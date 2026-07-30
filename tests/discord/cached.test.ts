import { expect, test, vi } from 'vite-plus/test'
import { fetchMessageCached } from '../../src/discord/cached.ts'

test('returns a cached message without making a Discord request', async () => {
  const message = { id: 'message-1' }
  const getMessage = vi.fn(async () => ({ id: 'fetched-message' }))
  const restGetMessage = vi.fn(async () => ({ id: 'rest-message' }))

  const result = await fetchMessageCached(
    {
      getChannel: vi.fn(() => ({
        getMessage,
        messages: { get: vi.fn(() => message) }
      })),
      rest: { channels: { getMessage: restGetMessage } }
    } as never,
    'channel-1',
    'message-1'
  )

  expect(result).toBe(message)
  expect(getMessage).not.toHaveBeenCalled()
  expect(restGetMessage).not.toHaveBeenCalled()
})

test('uses the cached channel method before REST', async () => {
  const message = { id: 'fetched-message' }
  const getMessage = vi.fn(async () => message)
  const restGetMessage = vi.fn(async () => ({ id: 'rest-message' }))

  const result = await fetchMessageCached(
    {
      getChannel: vi.fn(() => ({
        getMessage,
        messages: { get: vi.fn(() => undefined) }
      })),
      rest: { channels: { getMessage: restGetMessage } }
    } as never,
    'channel-1',
    'message-1'
  )

  expect(result).toBe(message)
  expect(getMessage).toHaveBeenCalledWith('message-1')
  expect(restGetMessage).not.toHaveBeenCalled()
})

test('falls back to REST after a cached channel read fails', async () => {
  const restMessage = { id: 'rest-message' }
  const restGetMessage = vi.fn(async () => restMessage)

  const result = await fetchMessageCached(
    {
      getChannel: vi.fn(() => ({
        getMessage: vi.fn(() => Promise.reject(new Error('stale channel'))),
        messages: { get: vi.fn(() => undefined) }
      })),
      rest: { channels: { getMessage: restGetMessage } }
    } as never,
    'channel-1',
    'message-1'
  )

  expect(result).toBe(restMessage)
  expect(restGetMessage).toHaveBeenCalledWith('channel-1', 'message-1')
})
