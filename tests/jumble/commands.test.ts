import { Permission, Permissions } from 'oceanic.js'
import { slashCommandToDiscord } from 'rosepack'
import { expect, test, vi } from 'vite-plus/test'
import { rosepack } from '../../src/bot/rosepack.ts'
import askCommand from '../../src/commands/ask.ts'
import { slashCommands } from '../../src/commands/index.ts'
import jumbleCommand from '../../src/commands/jumble.ts'
import memoryCommand from '../../src/commands/memory.ts'
import { componentIds, jumbleComponents } from '../../src/jumble/components.ts'
import { jumblePermissionError } from '../../src/jumble/discord.ts'
import { modules } from '../../src/modules.ts'

test('keeps Jumble out of global registration until its guild module is enabled', () => {
  const registry = rosepack.createRegistry({ components: jumbleComponents, slashCommands })
  const names = registry.payload.map((command) => command.name)
  expect(names).not.toContain('jumble')
  expect(names).toContain('modules')
  expect(names).toContain('ask')
  expect(names).not.toContain('memory')
  expect(names).not.toContain('jumble-profile')
  expect(names).not.toContain('jumble-stats')
  expect(registry.modules.catalog.ai).toBe(modules.ai)
  expect(registry.modules.catalog.jumble).toBe(modules.jumble)
  expect(askCommand.module).toBeUndefined()
  expect(askCommand.contexts).toEqual(['botDm', 'privateChannel', 'guild'])
  expect(askCommand.installations).toEqual(['user'])
  expect(memoryCommand.module).toBe(modules.ai)
  expect(slashCommandToDiscord(jumbleCommand)).toMatchObject({
    options: [{ name: 'play' }, { name: 'profile' }, { name: 'stats' }]
  })
  expect(registry.components).toHaveLength(5)
})

test('reports every channel permission needed before starting a game', () => {
  const allowed = new Permission(
    Permissions.VIEW_CHANNEL |
      Permissions.SEND_MESSAGES |
      Permissions.READ_MESSAGE_HISTORY |
      Permissions.ADD_REACTIONS |
      Permissions.ATTACH_FILES
  )
  expect(jumblePermissionError({ appPermissions: allowed, guildID: 'guild-1' })).toBeNull()

  const denied = new Permission(Permissions.VIEW_CHANNEL)
  const error = jumblePermissionError({ appPermissions: denied, guildID: 'guild-1' })
  expect(error).toContain('Send Messages')
  expect(error).toContain('Read Message History')
  expect(error).toContain('Add Reactions')
  expect(error).toContain('Attach Files')
  expect(jumblePermissionError({ appPermissions: denied, guildID: null })).toBeNull()
})

test('slash play does not show a typing indicator', async () => {
  const sendTyping = vi.fn(async () => undefined)
  const editResponse = vi.fn(async () => undefined)

  await jumbleCommand.subcommands.play.execute({
    client: {
      getChannel: vi.fn(() => ({ sendTyping })),
      rest: { channels: { sendTyping } }
    },
    defer: vi.fn(async () => undefined),
    editResponse,
    interaction: { channelID: 'channel-1' },
    options: { kind: 'unsupported' }
  } as never)

  expect(editResponse).toHaveBeenCalledWith('That Jumble type is not available.')
  expect(sendTyping).not.toHaveBeenCalled()
})

test('enabling the Jumble module reconciles its guild command', async () => {
  const createGuildCommand = vi.fn(async () => ({}))
  let enabledModules: readonly string[] = []
  const moduleStore = {
    mutate: vi.fn(async () => {
      enabledModules = ['jumble']
      return { changed: true, modules: enabledModules }
    }),
    read: vi.fn(async () => enabledModules),
    readOwnedCommandKeys: vi.fn(async () => []),
    writeOwnedCommandKeys: vi.fn(async () => undefined)
  }
  const client = {
    rest: {
      applications: {
        createGuildCommand,
        getGuildCommands: vi.fn(async () => [])
      }
    }
  }
  const registry = rosepack.createRegistry({ slashCommands })
  const result = await registry.modules.enable({
    app: { moduleStore } as never,
    applicationID: 'app-1',
    client: client as never,
    guildID: 'guild-1',
    module: modules.jumble
  })

  expect(result.changed).toBe(true)
  expect(moduleStore.mutate).toHaveBeenCalledWith({
    applicationID: 'app-1',
    enabled: true,
    guildID: 'guild-1',
    module: 'jumble'
  })
  expect(createGuildCommand).toHaveBeenCalledWith(
    'app-1',
    'guild-1',
    expect.objectContaining({ name: 'jumble' })
  )
})

test('enabling the AI module reconciles its guild memory command', async () => {
  const createGuildCommand = vi.fn(async () => ({}))
  let enabledModules: readonly string[] = []
  const moduleStore = {
    mutate: vi.fn(async () => {
      enabledModules = ['ai']
      return { changed: true, modules: enabledModules }
    }),
    read: vi.fn(async () => enabledModules),
    readOwnedCommandKeys: vi.fn(async () => []),
    writeOwnedCommandKeys: vi.fn(async () => undefined)
  }
  const client = {
    rest: {
      applications: {
        createGuildCommand,
        getGuildCommands: vi.fn(async () => [])
      }
    }
  }
  const registry = rosepack.createRegistry({ slashCommands })

  await registry.modules.enable({
    app: { moduleStore } as never,
    applicationID: 'app-1',
    client: client as never,
    guildID: 'guild-1',
    module: modules.ai
  })

  expect(createGuildCommand).toHaveBeenCalledWith(
    'app-1',
    'guild-1',
    expect.objectContaining({ name: 'memory' })
  )
})

test('builds compact routed IDs for every game control', () => {
  const ids = componentIds('12345678-1234-4234-8234-123456789abc')
  expect(ids.hint).toBe('jumble/hint/12345678-1234-4234-8234-123456789abc')
  expect(ids.unblur).toContain('jumble/unblur/')
  expect(ids.reshuffle).toContain('jumble/reshuffle/')
  expect(ids.giveUp).toContain('jumble/give-up/')
  expect(ids.replay('track')).toBe('jumble/replay/track')
})
