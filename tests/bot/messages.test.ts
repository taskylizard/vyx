import type { Message } from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import type { BotContext } from '../../src/bot/context.ts'
import { handleMessageCreate } from '../../src/bot/messages.ts'
import { TASKYLAND_GUILD_ID } from '../../src/discord/ids.ts'
import { modules } from '../../src/modules.ts'
import { partialFixture } from '../fixtures/partial.ts'

test('does not send autoembed messages to the AI responder', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { createMessage, editMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: {
      isEnabled: vi.fn(async ({ module }: { module: string }) => module === modules.autoembeds.id)
    },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> https://reddit.com/r/typescript/comments/example/',
    flags: 0,
    guildID: TASKYLAND_GUILD_ID,
    id: 'message',
    mentions: { users: [{ id: 'bot' }] }
  })

  await handleMessageCreate(context, message)

  expect(createMessage).toHaveBeenCalledOnce()
  expect(editMessage).toHaveBeenCalledOnce()
  expect(replyToMessage).not.toHaveBeenCalled()
})

test('allows -ignore autoembed messages to reach the AI responder', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const createMessage = vi.fn(async () => ({}))
  const editMessage = vi.fn(async () => ({}))
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { createMessage, editMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: vi.fn(async () => true) },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> https://reddit.com/r/typescript -ignore',
    flags: 0,
    guildID: TASKYLAND_GUILD_ID,
    id: 'message',
    mentions: { users: [{ id: 'bot' }] }
  })

  await handleMessageCreate(context, message)

  expect(createMessage).not.toHaveBeenCalled()
  expect(editMessage).not.toHaveBeenCalled()
  expect(replyToMessage).toHaveBeenCalledWith(context, message)
})

test('guild mentions reach the AI responder only when the AI module is enabled', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const moduleEnabled = vi.fn(async ({ module }: { module: string }) => module === modules.ai.id)
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: {},
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: moduleEnabled },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> hello',
    guildID: 'guild',
    mentions: { users: [{ id: 'bot' }] }
  })

  await handleMessageCreate(context, message)
  expect(replyToMessage).toHaveBeenCalledWith(context, message)
  expect(moduleEnabled).toHaveBeenCalledWith({
    applicationID: 'app',
    guildID: 'guild',
    module: modules.ai.id
  })

  replyToMessage.mockClear()
  moduleEnabled.mockResolvedValue(false)
  await handleMessageCreate(context, message)
  expect(replyToMessage).not.toHaveBeenCalled()
})

test('does not respond to mentions when the AI module is disabled in Taskyland', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const moduleEnabled = vi.fn(async () => false)
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: {},
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: moduleEnabled },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> hello',
    guildID: TASKYLAND_GUILD_ID,
    mentions: { users: [{ id: 'bot' }] }
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).not.toHaveBeenCalled()
  expect(moduleEnabled).toHaveBeenCalledWith({
    applicationID: 'app',
    guildID: TASKYLAND_GUILD_ID,
    module: modules.ai.id
  })
})

test('only checks for active Jumble guesses when the guild module is enabled', async () => {
  const activeForChannel = vi.fn(async (): Promise<unknown> => null)
  const moduleEnabled = vi.fn(async () => true)
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: {},
    jumble: { activeForChannel },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: moduleEnabled },
    responder: { replyToMessage: vi.fn() }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: 'guess',
    guildID: 'guild',
    mentions: { users: [] }
  })

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

test('ignores reply pings to autoembed responses', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const getMessage = vi.fn(async () => ({
    author: { id: 'user' },
    content: 'check this out https://instagram.com/reel/example/'
  }))
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { getMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: {
      isEnabled: vi.fn(async ({ module }: { module: string }) => module === modules.ai.id)
    },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: 'lol this is insane',
    guildID: 'guild',
    id: 'message',
    mentions: { users: [{ id: 'bot' }] },
    referencedMessage: {
      author: { bot: true, id: 'bot' },
      channelID: 'channel',
      content: '',
      messageReference: { channelID: 'channel', messageID: 'parent-message' }
    }
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).not.toHaveBeenCalled()
  expect(getMessage).toHaveBeenCalledWith('channel', 'parent-message')
})

test('responds to explicit mentions in replies to autoembed responses', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const getMessage = vi.fn(async () => ({}))
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { getMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: {
      isEnabled: vi.fn(async ({ module }: { module: string }) => module === modules.ai.id)
    },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: '<@bot> what song is in this reel?',
    guildID: 'guild',
    id: 'message',
    mentions: { users: [{ id: 'bot' }] },
    referencedMessage: {
      author: { bot: true, id: 'bot' },
      channelID: 'channel',
      content: '',
      messageReference: { channelID: 'channel', messageID: 'parent-message' }
    }
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).toHaveBeenCalledWith(context, message)
  expect(getMessage).not.toHaveBeenCalled()
})

test('responds to reply pings on regular bot responses', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const getMessage = vi.fn(async () => ({
    author: { id: 'user' },
    content: '<@bot> hello there'
  }))
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { getMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: {
      isEnabled: vi.fn(async ({ module }: { module: string }) => module === modules.ai.id)
    },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: 'tell me more',
    guildID: 'guild',
    id: 'message',
    mentions: { users: [{ id: 'bot' }] },
    referencedMessage: {
      author: { bot: true, id: 'bot' },
      channelID: 'channel',
      content: 'hi! how can I help?',
      messageReference: { channelID: 'channel', messageID: 'parent-message' }
    }
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).toHaveBeenCalledWith(context, message)
})

test('responds when a replied-to bot message cannot be resolved', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const getMessage = vi.fn(async () => {
    throw new Error('unknown message')
  })
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    env: {},
    client: { rest: { channels: { getMessage } } },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: {
      isEnabled: vi.fn(async ({ module }: { module: string }) => module === modules.ai.id)
    },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'user' },
    channelID: 'channel',
    content: 'any thoughts?',
    guildID: 'guild',
    id: 'message',
    mentions: { users: [{ id: 'bot' }] },
    messageReference: { channelID: 'channel', messageID: 'deleted-message' },
    referencedMessage: null
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).toHaveBeenCalledWith(context, message)
})

test('routes every skyblock-channel message from the configured user to the advisor', async () => {
  const replyToMessage = vi.fn(async () => undefined)
  const context = partialFixture<BotContext>({
    applicationID: 'app',
    botUserID: 'bot',
    chime: { observe: vi.fn() },
    client: {},
    env: { SKYBLOCK_CHANNEL_ID: 'skyblock-channel', SKYBLOCK_DISCORD_USER_ID: 'owner' },
    jumble: { activeForChannel: vi.fn(async () => null) },
    logger: { warn: vi.fn() },
    moduleStore: { isEnabled: vi.fn(async () => true) },
    responder: { replyToMessage }
  })
  const message = partialFixture<Message>({
    author: { bot: false, id: 'owner' },
    channelID: 'skyblock-channel',
    content: 'what should I grind next?',
    flags: 0,
    guildID: TASKYLAND_GUILD_ID,
    mentions: { users: [] }
  })

  await handleMessageCreate(context, message)

  expect(replyToMessage).toHaveBeenCalledWith(context, message)

  replyToMessage.mockClear()
  await handleMessageCreate(
    context,
    partialFixture<Message>({
      author: { bot: false, id: 'someone-else' },
      channelID: 'skyblock-channel',
      content: 'what should I grind next?',
      flags: 0,
      guildID: TASKYLAND_GUILD_ID,
      mentions: { users: [] }
    })
  )
  expect(replyToMessage).not.toHaveBeenCalled()
})
