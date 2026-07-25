import type { Message } from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import type { BotContext } from '../../src/bot/context.ts'
import { handleMessageCreate } from '../../src/bot/messages.ts'
import { TASKYLAND_GUILD_ID } from '../../src/discord/ids.ts'

test('does not send autoembed messages to the AI responder', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = {
    botUserID: 'bot',
    client: { rest: { channels: { createMessage, editMessage } } },
    logger: { warn: vi.fn() },
    responder: { replyToMessage }
  } as unknown as BotContext
  const message = {
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> https://reddit.com/r/typescript/comments/example/',
    flags: 0,
    guildID: TASKYLAND_GUILD_ID,
    id: 'message',
    mentions: { users: [{ id: 'bot' }] }
  } as unknown as Message

  await handleMessageCreate(context, message)

  expect(createMessage).toHaveBeenCalledOnce()
  expect(editMessage).toHaveBeenCalledOnce()
  expect(replyToMessage).not.toHaveBeenCalled()
})

test('allows -ignore autoembed messages to reach the AI responder', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = {
    botUserID: 'bot',
    client: { rest: { channels: { createMessage, editMessage } } },
    logger: { warn: vi.fn() },
    responder: { replyToMessage }
  } as unknown as BotContext
  const message = {
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> https://reddit.com/r/typescript -ignore',
    flags: 0,
    guildID: TASKYLAND_GUILD_ID,
    id: 'message',
    mentions: { users: [{ id: 'bot' }] }
  } as unknown as Message

  await handleMessageCreate(context, message)

  expect(createMessage).not.toHaveBeenCalled()
  expect(editMessage).not.toHaveBeenCalled()
  expect(replyToMessage).toHaveBeenCalledWith(context, message)
})

test('only checks for active Jumble guesses when the guild module is enabled', async () => {
  const activeForChannel = vi.fn(async (): Promise<unknown> => null)
  const moduleEnabled = vi.fn(async () => true)
  const context = {
    applicationID: 'app',
    botUserID: 'bot',
    client: {},
    jumble: { activeForChannel },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: moduleEnabled },
    responder: { replyToMessage: vi.fn() }
  } as unknown as BotContext
  const message = {
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: 'guess',
    guildID: 'guild',
    mentions: { users: [] }
  } as unknown as Message

  await handleMessageCreate(context, message)
  expect(activeForChannel).toHaveBeenCalledWith('channel')
  expect(moduleEnabled).not.toHaveBeenCalled()

  activeForChannel.mockResolvedValue({ session: { id: 'session' } })
  moduleEnabled.mockResolvedValue(false)
  activeForChannel.mockClear()
  await handleMessageCreate(context, message)
  expect(activeForChannel).toHaveBeenCalledWith('channel')
  expect(moduleEnabled).toHaveBeenCalledWith({
    applicationID: 'app',
    guildID: 'guild',
    module: 'jumble'
  })
})
