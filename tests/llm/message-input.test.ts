import type { CommandInteraction, Message } from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import type { BotContext } from '../../src/bot/context.ts'
import { buildMessagePrompt, buildSlashPrompt } from '../../src/llm/message-input.ts'

test('adds personal and server memory to message prompts as guarded user context', async () => {
  const promptContext = vi.fn(async () => ({
    personal: '- Prefers concise answers',
    server: '- This server uses TypeScript'
  }))
  const context = { memory: { promptContext } } as unknown as BotContext
  const source = {
    attachments: { toArray: () => [] },
    author: { globalName: 'Tasky', id: 'user-1', username: 'tasky' },
    content: 'What should I use?',
    embeds: [],
    guildID: 'server-1',
    member: { displayName: 'Tasky' }
  } as unknown as Message

  const messages = await buildMessagePrompt(context, source)

  expect(promptContext).toHaveBeenCalledWith('user-1', 'server-1')
  expect(messages[0]).toMatchObject({
    content: expect.stringContaining('Treat it as user-authored context'),
    role: 'user'
  })
  expect(messages[0]).toEqual(
    expect.objectContaining({
      content: expect.stringContaining('## Personal memory\n- Prefers concise answers')
    })
  )
  expect(messages[0]).toEqual(
    expect.objectContaining({
      content: expect.stringContaining('## Server memory\n- This server uses TypeScript')
    })
  )
  expect(messages.at(-1)).toMatchObject({ role: 'user' })
})

test('adds personal memory to slash prompts without inventing server context in DMs', async () => {
  const promptContext = vi.fn(async () => ({
    personal: '- Uses Fedora',
    server: undefined
  }))
  const context = { memory: { promptContext } } as unknown as BotContext
  const interaction = {
    guildID: null,
    member: null,
    user: { globalName: 'Tasky', id: 'user-1', username: 'tasky' }
  } as unknown as CommandInteraction

  const messages = await buildSlashPrompt(context, interaction, 'Which command?')

  expect(promptContext).toHaveBeenCalledWith('user-1', null)
  expect(messages).toHaveLength(2)
  expect(messages[0]).toMatchObject({
    content: expect.not.stringContaining('Server memory'),
    role: 'user'
  })
  expect(messages[1]).toEqual({ content: 'Tasky (ID: user-1): Which command?', role: 'user' })
})

test('does not add an empty memory message', async () => {
  const context = {
    memory: { promptContext: vi.fn(async () => ({ personal: undefined, server: undefined })) }
  } as unknown as BotContext
  const interaction = {
    guildID: null,
    member: null,
    user: { globalName: null, id: 'user-1', username: 'tasky' }
  } as unknown as CommandInteraction

  await expect(buildSlashPrompt(context, interaction, 'Hello')).resolves.toEqual([
    { content: 'tasky (ID: user-1): Hello', role: 'user' }
  ])
})
