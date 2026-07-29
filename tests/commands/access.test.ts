import { MessageFlags } from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import askCommand from '../../src/commands/ask.ts'
import modulesCommand from '../../src/commands/modules.ts'
import { OWNER_USER_ID } from '../../src/discord/ids.ts'

test('/modules rejects non-owner users before reading module state', async () => {
  const reply = vi.fn(async () => undefined)
  const defer = vi.fn(async () => undefined)
  const list = vi.fn(async () => [])

  await modulesCommand.subcommands.list.execute({
    defer,
    interaction: { user: { id: 'not-the-owner' } },
    modules: { list },
    reply
  } as never)

  expect(reply).toHaveBeenCalledWith({
    content: 'Only the bot owner can use this command.',
    flags: MessageFlags.EPHEMERAL
  })
  expect(defer).not.toHaveBeenCalled()
  expect(list).not.toHaveBeenCalled()
})

test('/ask rejects non-owner users before invoking the responder', async () => {
  const reply = vi.fn(async () => undefined)
  const answerPrompt = vi.fn(async () => undefined)
  const defer = vi.fn(async () => undefined)

  await askCommand.execute({
    app: { responder: { answerPrompt } },
    defer,
    interaction: { user: { id: 'not-the-owner' } },
    options: { ephemeral: false, question: 'secret' },
    reply
  } as never)

  expect(reply).toHaveBeenCalledWith({
    content: 'Only the bot owner can use this command.',
    flags: MessageFlags.EPHEMERAL
  })
  expect(defer).not.toHaveBeenCalled()
  expect(answerPrompt).not.toHaveBeenCalled()
})

test('/modules still allows the bot owner to inspect a guild', async () => {
  const defer = vi.fn(async () => undefined)
  const editResponse = vi.fn(async () => undefined)

  await modulesCommand.subcommands.list.execute({
    defer,
    editResponse,
    interaction: { guildID: 'guild-1', user: { id: OWNER_USER_ID } },
    modules: { list: vi.fn(async () => []) },
    reply: vi.fn(async () => undefined)
  } as never)

  expect(defer).toHaveBeenCalledWith({ ephemeral: true })
  expect(editResponse).toHaveBeenCalledWith(
    '**Server modules**\n⬜ 🤖 AI\n⬜ 🔗 Autoembeds\n⬜ 🧩 Jumble'
  )
})
