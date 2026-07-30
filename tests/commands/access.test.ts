import { expect, test, vi } from 'vite-plus/test'
import askCommand from '../../src/commands/ask.ts'
import modulesCommand from '../../src/commands/modules.ts'
import { botOwnerGuard } from '../../src/discord/guards.ts'
import { OWNER_USER_ID } from '../../src/discord/ids.ts'

test('/modules rejects non-owner users before reading module state', async () => {
  expect(modulesCommand.subcommands.list.guards).toContain(botOwnerGuard)
  const decision = await botOwnerGuard({
    app: {},
    interaction: { user: { id: 'not-the-owner' } }
  } as never)

  expect(decision.allowed).toBe(false)
  if (decision.allowed) throw new Error('Expected the owner guard to deny access.')
  expect(decision.options.message).toBe('Only the bot owner can use this.')
})

test('/ask rejects non-owner users before invoking the responder', async () => {
  expect(askCommand.guards).toContain(botOwnerGuard)
  const decision = await botOwnerGuard({
    app: {},
    interaction: { user: { id: 'not-the-owner' } }
  } as never)

  expect(decision.allowed).toBe(false)
  if (decision.allowed) throw new Error('Expected the owner guard to deny access.')
  expect(decision.options.message).toBe('Only the bot owner can use this.')
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
