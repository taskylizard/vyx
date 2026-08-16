import { expect, test, vi } from 'vite-plus/test'
import { sendResponse, type ResponseTarget } from '../../src/discord/response-target.ts'

test('edits interaction responses as content or an embed according to Discord limits', async () => {
  const editOriginal = vi.fn(async () => ({}))
  const target = {
    interaction: { editOriginal },
    kind: 'interaction'
  } satisfies ResponseTarget

  await sendResponse({}, target, 'short response')
  await sendResponse({}, target, 'x'.repeat(2_001))

  expect(editOriginal).toHaveBeenNthCalledWith(1, {
    content: 'short response',
    embeds: null
  })
  expect(editOriginal).toHaveBeenNthCalledWith(2, {
    content: null,
    embeds: [{ description: 'x'.repeat(2_001) }]
  })
})

test('edits placeholder messages as content or an embed according to Discord limits', async () => {
  const editMessage = vi.fn(async () => ({}))
  const context = {
    client: { rest: { channels: { editMessage } } }
  }
  const target = {
    kind: 'message',
    placeholder: { channelID: 'channel', messageID: 'message' }
  } satisfies ResponseTarget

  await sendResponse(context, target, 'short response')
  await sendResponse(context, target, 'x'.repeat(2_001))

  expect(editMessage).toHaveBeenNthCalledWith(1, 'channel', 'message', {
    content: 'short response',
    embeds: null
  })
  expect(editMessage).toHaveBeenNthCalledWith(2, 'channel', 'message', {
    content: null,
    embeds: [{ description: 'x'.repeat(2_001) }]
  })
})
