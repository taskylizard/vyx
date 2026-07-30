import { expect, test, vi } from 'vite-plus/test'
import {
  safeCreateMessage,
  safeCreateReaction,
  safeEditMessage
} from '../../src/discord/safe-actions.ts'

test('creates messages through cached channels first', async () => {
  const message = { id: 'cached-message' }
  const cachedCreateMessage = vi.fn(async () => message)
  const restCreateMessage = vi.fn(async () => ({ id: 'rest-message' }))

  const result = await safeCreateMessage(
    {
      getChannel: vi.fn(() => ({ createMessage: cachedCreateMessage })),
      rest: { channels: { createMessage: restCreateMessage } }
    } as never,
    'channel-1',
    { content: 'hello' }
  )

  expect(result).toBe(message)
  expect(cachedCreateMessage).toHaveBeenCalledWith({ content: 'hello' })
  expect(restCreateMessage).not.toHaveBeenCalled()
})

test('falls back to REST when a channel is missing or stale', async () => {
  const restCreateMessage = vi.fn(async () => ({ id: 'rest-message' }))
  const missingResult = await safeCreateMessage(
    {
      getChannel: vi.fn(() => undefined),
      rest: { channels: { createMessage: restCreateMessage } }
    } as never,
    'channel-1',
    { content: 'missing' }
  )

  const cachedCreateMessage = vi.fn(() => Promise.reject(new Error('stale channel')))
  const staleResult = await safeCreateMessage(
    {
      getChannel: vi.fn(() => ({ createMessage: cachedCreateMessage })),
      rest: { channels: { createMessage: restCreateMessage } }
    } as never,
    'channel-1',
    { content: 'stale' }
  )

  expect(missingResult.id).toBe('rest-message')
  expect(staleResult.id).toBe('rest-message')
  expect(restCreateMessage).toHaveBeenCalledTimes(2)
})

test('falls back to REST after a cached edit fails', async () => {
  const cachedEditMessage = vi.fn(() => Promise.reject(new Error('stale channel')))
  const restEditMessage = vi.fn(async () => ({ id: 'message-1' }))

  await safeEditMessage(
    {
      getChannel: vi.fn(() => ({ editMessage: cachedEditMessage })),
      rest: { channels: { editMessage: restEditMessage } }
    } as never,
    'channel-1',
    'message-1',
    { content: 'finished' }
  )

  expect(cachedEditMessage).toHaveBeenCalledWith('message-1', { content: 'finished' })
  expect(restEditMessage).toHaveBeenCalledWith('channel-1', 'message-1', {
    content: 'finished'
  })
})

test('keeps optional reactions from breaking message handling', async () => {
  const restCreateReaction = vi.fn(async () => undefined)
  const message = {
    channelID: 'channel-1',
    client: { rest: { channels: { createReaction: restCreateReaction } } },
    createReaction: vi.fn(() => Promise.reject(new Error('stale message'))),
    id: 'message-1'
  }

  await expect(safeCreateReaction(message as never, '✅')).resolves.toBe(true)
  expect(restCreateReaction).toHaveBeenCalledWith('channel-1', 'message-1', '✅')

  restCreateReaction.mockRejectedValueOnce(new Error('missing permission'))
  await expect(safeCreateReaction(message as never, '✅')).resolves.toBe(false)
})
