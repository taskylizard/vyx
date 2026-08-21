import type { Client, Message } from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import type { KanikouResponder } from '../../src/llm/responder.ts'
import { CHIME_SCOPE } from '../../src/chime/settings.ts'
import { ChimeWatcher } from '../../src/chime/watcher.ts'
import { suppressAllMentions } from '../../src/discord/message-options.ts'
import { TASKYLAND_GUILD_ID } from '../../src/discord/ids.ts'
import { partialFixture } from '../fixtures/partial.ts'

const TEST_SETTINGS = {
  chance: 1,
  cooldownMs: 60 * 60 * 1000,
  maxGapMs: 4 * 60 * 1000,
  maxSendDelayMs: 0,
  minAuthors: 2,
  minMessages: 3,
  minSendDelayMs: 0,
  windowMs: 10 * 60 * 1000
} as const

function chatterMessage(id: string, userID: string, content: string): Message {
  return partialFixture<Message>({
    author: { bot: false, globalName: null, id: userID, username: `user-${userID}` },
    channelID: CHIME_SCOPE.channelID,
    content,
    guildID: TASKYLAND_GUILD_ID,
    id,
    timestamp: new Date()
  })
}

interface WatcherHarness {
  createMessage: ReturnType<typeof vi.fn>
  generateWithoutTools: ReturnType<typeof vi.fn>
  sendTyping: ReturnType<typeof vi.fn>
  watcher: ChimeWatcher
}

function createWatcher(reply: string | Error): WatcherHarness {
  const createMessage = vi.fn(async () => ({ channelID: CHIME_SCOPE.channelID, id: 'sent' }))
  const sendTyping = vi.fn(async () => undefined)
  const generateWithoutTools = vi.fn(async () => {
    if (reply instanceof Error) throw reply
    return reply
  })
  const logger = { info: vi.fn(), warn: vi.fn() }
  const watcher = new ChimeWatcher({
    client: partialFixture<Client>({
      rest: { channels: { createMessage, sendTyping } }
    }),
    logger: partialFixture(logger),
    responder: partialFixture<KanikouResponder>({ generateWithoutTools }),
    settings: TEST_SETTINGS
  })

  return { createMessage, generateWithoutTools, logger, sendTyping, watcher }
}

interface WatcherHarness {
  createMessage: ReturnType<typeof vi.fn>
  generateWithoutTools: ReturnType<typeof vi.fn>
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
  sendTyping: ReturnType<typeof vi.fn>
  watcher: ChimeWatcher
}

test('ignores chatter outside the chime scope', async () => {
  const { createMessage, generateWithoutTools, watcher } = createWatcher('nice')
  const elsewhere = partialFixture<Message>({
    author: { bot: false, globalName: null, id: 'alice', username: 'user-alice' },
    channelID: 'other-channel',
    content: 'hello',
    guildID: TASKYLAND_GUILD_ID,
    id: 'm1',
    timestamp: new Date()
  })
  const otherGuild = partialFixture<Message>({
    author: { bot: false, globalName: null, id: 'bob', username: 'user-bob' },
    channelID: CHIME_SCOPE.channelID,
    content: 'hello',
    guildID: 'other-guild',
    id: 'm2',
    timestamp: new Date()
  })

  watcher.observe('bot', elsewhere)
  watcher.observe('bot', otherGuild)
  await new Promise((resolve) => setTimeout(resolve, 10))

  expect(generateWithoutTools).not.toHaveBeenCalled()
  expect(createMessage).not.toHaveBeenCalled()
})

test('chimes into a lively unbroken conversation as a plain message', async () => {
  const { createMessage, generateWithoutTools, sendTyping, watcher } = createWatcher('lol same')

  watcher.observe('bot', chatterMessage('m1', 'alice', 'this release notes post is unhinged'))
  watcher.observe('bot', chatterMessage('m2', 'bob', 'reading it like a saga tbh'))
  watcher.observe('bot', chatterMessage('m3', 'carol', 'the migration section killed me'))

  await vi.waitFor(() => expect(createMessage).toHaveBeenCalledOnce())

  const [channelID, options] = createMessage.mock.calls[0]
  expect(channelID).toBe(CHIME_SCOPE.channelID)
  expect(options.content).toBe('lol same')
  expect(options.allowedMentions).toEqual(suppressAllMentions)
  expect(sendTyping).toHaveBeenCalledWith(CHIME_SCOPE.channelID)

  const [messages, instructions] = generateWithoutTools.mock.calls[0]
  expect(messages).toHaveLength(3)
  expect(String(messages[0].content)).toContain('user-alice')
  expect(instructions).toContain('ONE short remark')
})

test('never chimes twice inside the cooldown window', async () => {
  const { createMessage, generateWithoutTools, watcher } = createWatcher('wild take')

  for (const [index, [userID, content]] of [
    ['alice', 'one'],
    ['bob', 'two'],
    ['carol', 'three'],
    ['alice', 'four'],
    ['bob', 'five'],
    ['carol', 'six']
  ].entries()) {
    watcher.observe('bot', chatterMessage(`m${index}`, userID, content))
  }

  await vi.waitFor(() => expect(createMessage).toHaveBeenCalledOnce())
  await new Promise((resolve) => setTimeout(resolve, 25))

  expect(generateWithoutTools).toHaveBeenCalledOnce()
  expect(createMessage).toHaveBeenCalledOnce()
})

test('stays quiet when the model declines with the skip sentinel', async () => {
  const { createMessage, generateWithoutTools, watcher } = createWatcher('SKIP')

  watcher.observe('bot', chatterMessage('m1', 'alice', 'anyone up?'))
  watcher.observe('bot', chatterMessage('m2', 'bob', 'always'))
  watcher.observe('bot', chatterMessage('m3', 'carol', 'unfortunately'))

  await vi.waitFor(() => expect(generateWithoutTools).toHaveBeenCalledOnce())
  await new Promise((resolve) => setTimeout(resolve, 10))

  expect(createMessage).not.toHaveBeenCalled()
})

test('logs generation failures instead of throwing out of observe', async () => {
  const { generateWithoutTools, logger, watcher } = createWatcher(new Error('model exploded'))

  watcher.observe('bot', chatterMessage('m1', 'alice', 'brave of you'))
  watcher.observe('bot', chatterMessage('m2', 'bob', 'bold move'))
  watcher.observe('bot', chatterMessage('m3', 'carol', 'chaos'))

  await vi.waitFor(() =>
    expect(logger.warn).toHaveBeenCalledWith('chime attempt failed', {
      error: expect.anything()
    })
  )

  expect(generateWithoutTools).toHaveBeenCalledOnce()
})
