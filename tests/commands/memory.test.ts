import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MessageFlags, type CommandInteraction } from 'oceanic.js'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import type { BotContext } from '../../src/bot/context.ts'
import type {
  SlashCommandOptionValues,
  SlashCommandValueOptionRecord,
  SlashSubcommandDefinition
} from 'rosepack'
import { SlashCommandContext } from 'rosepack'
import { rosepack } from '../../src/bot/rosepack.ts'
import memoryCommand from '../../src/commands/memory.ts'
import { MarkdownMemoryStore } from '../../src/memory/markdown-memory.ts'

const temporaryDirectories: string[] = []
const memoryCommands = rosepack.createRegistry([memoryCommand])

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

test('supports the complete personal memory lifecycle', async () => {
  let idIndex = 1
  const memory = await createStore(() => memoryID(idIndex++))
  const bot = createBot(memory)

  const remember = createInteraction({ id: 'remember-call', userID: 'user-1' })
  await runMemorySubcommand({
    bot,
    interaction: remember.interaction,
    leaf: memoryCommand.subcommands.remember,
    options: { memory: 'Prefers concise answers' }
  })
  expect(remember.defer).toHaveBeenCalledWith(MessageFlags.EPHEMERAL)
  expect(remember.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('Remembered `00000001`') })
  )

  const show = createInteraction({ id: 'show-call', userID: 'user-1' })
  await runMemorySubcommand({
    bot,
    interaction: show.interaction,
    leaf: memoryCommand.subcommands.show,
    options: {}
  })
  expect(show.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('`00000001` — Prefers concise answers')
    })
  )

  const forget = createInteraction({ id: 'forget-call', userID: 'user-1' })
  await runMemorySubcommand({
    bot,
    interaction: forget.interaction,
    leaf: memoryCommand.subcommands.forget,
    options: { id: '00000001' }
  })
  expect(forget.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('Forgot `00000001`') })
  )

  await memory.remember({ id: 'user-1', kind: 'user' }, 'Temporary', 'setup-call')
  const clear = createInteraction({ id: 'clear-call', userID: 'user-1' })
  await runMemorySubcommand({
    bot,
    interaction: clear.interaction,
    leaf: memoryCommand.subcommands.clear,
    options: { confirm: true }
  })
  expect(clear.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: 'Deleted 1 personal memory.' })
  )

  const exported = createInteraction({ id: 'export-call', userID: 'user-1' })
  await runMemorySubcommand({
    bot,
    interaction: exported.interaction,
    leaf: memoryCommand.subcommands.export,
    options: {}
  })
  const exportPayload = exported.editOriginal.mock.calls.at(-1)?.[0]
  expect(exportPayload?.files?.[0]?.name).toBe('kanikou-personal-memory.md')
  expect(exportPayload?.files?.[0]?.contents.toString('utf8')).toContain(
    '# Kanikou personal memory'
  )
})

test('requires confirmation before clearing personal memory', async () => {
  const memory = await createStore()
  await memory.remember({ id: 'user-1', kind: 'user' }, 'Keep this', 'setup-call')
  const bot = createBot(memory)
  const interaction = createInteraction({ id: 'clear-call', userID: 'user-1' })

  await runMemorySubcommand({
    bot,
    interaction: interaction.interaction,
    leaf: memoryCommand.subcommands.clear,
    options: { confirm: false }
  })

  await expect(memory.list({ id: 'user-1', kind: 'user' })).resolves.toHaveLength(1)
  expect(interaction.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('confirmation was false') })
  )
})

test('allows everyone to inspect server memory but only managers to change it', async () => {
  let idIndex = 10
  const memory = await createStore(() => memoryID(idIndex++))
  const bot = createBot(memory)
  const denied = createInteraction({
    canManageServer: false,
    guildID: 'server-1',
    id: 'denied-call',
    userID: 'user-1'
  })

  await runMemorySubcommand({
    bot,
    interaction: denied.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.remember,
    options: { memory: 'Shared fact' }
  })
  await expect(memory.list({ id: 'server-1', kind: 'server' })).resolves.toEqual([])
  expect(denied.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('Manage Server') })
  )

  const manager = createInteraction({
    canManageServer: true,
    guildID: 'server-1',
    id: 'manager-call',
    userID: 'manager'
  })
  await runMemorySubcommand({
    bot,
    interaction: manager.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.remember,
    options: { memory: 'Shared fact' }
  })
  await expect(memory.list({ id: 'server-1', kind: 'server' })).resolves.toHaveLength(1)

  const viewer = createInteraction({
    canManageServer: false,
    guildID: 'server-1',
    id: 'viewer-call',
    userID: 'user-2'
  })
  await runMemorySubcommand({
    bot,
    interaction: viewer.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.show,
    options: {}
  })
  expect(viewer.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('Shared fact') })
  )
})

test('rejects server memory operations outside a server', async () => {
  const memory = await createStore()
  const bot = createBot(memory)
  const interaction = createInteraction({ guildID: null, id: 'dm-call', userID: 'user-1' })

  await runMemorySubcommand({
    bot,
    interaction: interaction.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.show,
    options: {}
  })

  expect(interaction.editOriginal).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.stringContaining('only be used inside') })
  )
})

test('supports server forget, clear, and Markdown export actions', async () => {
  let idIndex = 20
  const memory = await createStore(() => memoryID(idIndex++))
  const scope = { id: 'server-1', kind: 'server' } as const
  const first = await memory.remember(scope, 'First shared fact', 'setup-1')
  await memory.remember(scope, 'Second shared fact', 'setup-2')
  const bot = createBot(memory)

  const exported = createInteraction({ guildID: 'server-1', id: 'export-call', userID: 'viewer' })
  await runMemorySubcommand({
    bot,
    interaction: exported.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.export,
    options: {}
  })
  const exportPayload = exported.editOriginal.mock.calls.at(-1)?.[0]
  expect(exportPayload?.files?.[0]?.name).toBe('kanikou-server-memory.md')
  expect(exportPayload?.files?.[0]?.contents.toString('utf8')).toContain('First shared fact')

  const forgot = createInteraction({
    canManageServer: true,
    guildID: 'server-1',
    id: 'forget-call',
    userID: 'manager'
  })
  await runMemorySubcommand({
    bot,
    interaction: forgot.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.forget,
    options: { id: first.id.slice(0, 8) }
  })
  await expect(memory.list(scope)).resolves.toHaveLength(1)

  const unconfirmed = createInteraction({
    canManageServer: true,
    guildID: 'server-1',
    id: 'unconfirmed-call',
    userID: 'manager'
  })
  await runMemorySubcommand({
    bot,
    interaction: unconfirmed.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.clear,
    options: { confirm: false }
  })
  await expect(memory.list(scope)).resolves.toHaveLength(1)

  const cleared = createInteraction({
    canManageServer: true,
    guildID: 'server-1',
    id: 'clear-call',
    userID: 'manager'
  })
  await runMemorySubcommand({
    bot,
    interaction: cleared.interaction,
    leaf: memoryCommand.subcommands.server.subcommands.clear,
    options: { confirm: true }
  })
  await expect(memory.list(scope)).resolves.toEqual([])
})

function createBot(memory: MarkdownMemoryStore): BotContext {
  return {
    logger: { error: vi.fn() },
    memory
  } as unknown as BotContext
}

async function runMemorySubcommand<TOptions extends SlashCommandValueOptionRecord>({
  bot,
  interaction,
  leaf,
  options
}: {
  bot: BotContext
  interaction: CommandInteraction
  leaf: SlashSubcommandDefinition<BotContext, TOptions>
  options: SlashCommandOptionValues<TOptions>
}): Promise<void> {
  const root = memoryCommands.get('memory')
  if (root === undefined) {
    throw new Error('Expected the memory command in the test registry.')
  }
  const source = new SlashCommandContext({
    app: bot,
    command: root,
    interaction,
    node: root,
    options: {},
    registry: memoryCommands
  })
  await source.invoke(leaf, options)
}

function createInteraction({
  canManageServer = false,
  guildID = null,
  id,
  userID
}: {
  canManageServer?: boolean
  guildID?: string | null
  id: string
  userID: string
}) {
  let acknowledged = false
  const defer = vi.fn(async () => {
    acknowledged = true
  })
  const editOriginal = vi.fn(
    async (_payload: {
      allowedMentions?: AllowedMentionsShape
      content?: string
      files?: Array<{ contents: Buffer; name: string }>
    }) => ({})
  )
  return {
    defer,
    editOriginal,
    interaction: {
      get acknowledged() {
        return acknowledged
      },
      defer,
      editOriginal,
      guildID,
      id,
      memberPermissions: guildID === null ? null : { has: vi.fn(() => canManageServer) },
      user: { id: userID }
    } as unknown as CommandInteraction
  }
}

interface AllowedMentionsShape {
  everyone?: boolean
  repliedUser?: boolean
  roles?: boolean | string[]
  users?: boolean | string[]
}

async function createStore(createID: () => string = () => memoryID(1)) {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'kanikou-memory-command-'))
  temporaryDirectories.push(rootDirectory)
  return new MarkdownMemoryStore({
    createID,
    now: () => new Date('2026-07-13T12:00:00.000Z'),
    rootDirectory
  })
}

function memoryID(index: number): string {
  return `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
}
