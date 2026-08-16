import { Permission, Permissions } from 'oceanic.js'
import { slashCommandToDiscord } from 'rosepack'
import { expect, test, vi } from 'vite-plus/test'
import { rosepack } from '../../src/bot/rosepack.ts'
import askCommand from '../../src/commands/ask.ts'
import { slashCommands } from '../../src/commands/index.ts'
import jumbleCommand from '../../src/commands/jumble.ts'
import jumbleProfileSubcommand from '../../src/commands/jumble-profile.ts'
import memoryCommand from '../../src/commands/memory.ts'
import { componentIds, jumbleComponents } from '../../src/jumble/components.ts'
import { jumbleChannelPermissionsGuard, jumbleEnabledGuard } from '../../src/jumble/guards.ts'
import { jumblePermissionError } from '../../src/jumble/permissions.ts'
import { modules } from '../../src/modules.ts'
import { partialFixture } from '../fixtures/partial.ts'

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
    options: [{ name: 'play' }, { name: 'profile' }]
  })
  expect(jumbleCommand.subcommands.play.guards).toContain(jumbleChannelPermissionsGuard)
  for (const component of jumbleComponents) {
    expect(component.guards).toContain(jumbleEnabledGuard)
  }
  expect(registry.components).toHaveLength(6)
})

test('reports every channel permission needed before starting a game', async () => {
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

  const decision = await jumbleChannelPermissionsGuard(
    partialFixture({
      app: {},
      interaction: { appPermissions: denied, guildID: 'guild-1' }
    })
  )
  expect(decision.allowed).toBe(false)
})

test('component guards stop Jumble when its module is disabled', async () => {
  const isEnabled = vi.fn(async () => false)
  const decision = await jumbleEnabledGuard(
    partialFixture({
      app: { moduleStore: { isEnabled } },
      interaction: { applicationID: 'app-1', guildID: 'guild-1' }
    })
  )

  expect(isEnabled).toHaveBeenCalledWith({
    applicationID: 'app-1',
    guildID: 'guild-1',
    module: modules.jumble.id
  })
  expect(decision.allowed).toBe(false)
  if (decision.allowed) throw new Error('Expected the module guard to deny access.')
  expect(decision.options.message).toContain('Jumble is disabled here.')
})

test('slash play does not show a typing indicator', async () => {
  const sendTyping = vi.fn(async () => undefined)
  const editResponse = vi.fn(async () => undefined)

  await jumbleCommand.subcommands.play.execute(
    partialFixture({
      client: {
        getChannel: vi.fn(() => ({ sendTyping })),
        rest: { channels: { sendTyping } }
      },
      defer: vi.fn(async () => undefined),
      editResponse,
      interaction: { channelID: 'channel-1' },
      options: { kind: 'unsupported' }
    })
  )

  expect(editResponse).toHaveBeenCalledWith('That Jumble type is not available.')
  expect(sendTyping).not.toHaveBeenCalled()
})

test('slash play treats an explicit username as a one-game override', async () => {
  const editResponse = vi.fn(async () => undefined)
  const setProfile = vi.fn(async () => 'taskyliz')
  const start = vi.fn(async () => ({
    action: 'started' as const,
    state: {
      session: {
        id: '12345678-1234-4234-8234-123456789abc',
        starterUserId: 'user-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: null,
        kind: 'album' as const,
        sourceUsername: 'lastfm',
        answer: 'Album',
        artistName: 'Artist',
        albumName: 'Album',
        imageUrl: null,
        metadata: {
          candidate: { kind: 'album' as const, answer: 'Album', artistName: 'Artist' },
          hints: []
        },
        startedAt: 0,
        endedAt: null,
        outcome: null,
        blurStage: 0,
        reshuffleCount: 0
      },
      hints: []
    }
  }))

  await jumbleCommand.subcommands.play.execute(
    partialFixture({
      app: {
        jumble: { setProfile, start, attachMessage: vi.fn(async () => undefined) },
        jumbleRenderer: {}
      },
      defer: vi.fn(async () => undefined),
      editResponse,
      interaction: {
        channelID: 'channel-1',
        guildID: 'guild-1',
        user: { id: 'user-1' },
        getOriginal: vi.fn(async () => ({ id: 'message-1' }))
      },
      options: { kind: 'album', username: 'lastfm' }
    })
  )

  expect(setProfile).not.toHaveBeenCalled()
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({ starterUserId: 'user-1', kind: 'album', username: 'lastfm' })
  )
  expect(editResponse).toHaveBeenCalled()
})

test('jumble profile without a username renders the saved profile and all stats', async () => {
  const editResponse = vi.fn(async () => undefined)
  const profileSummary = vi.fn(async () => ({
    username: 'taskyliz',
    tracked: { all: 6, artist: 2, album: 3, track: 1 },
    stats: {
      all: {
        played: 4,
        won: 2,
        gaveUp: 1,
        expired: 1,
        guesses: 5,
        correctGuesses: 2,
        averageSeconds: 12.5,
        averageHints: 1,
        averageReshuffles: 0
      },
      artist: {
        played: 1,
        won: 1,
        gaveUp: 0,
        expired: 0,
        guesses: 1,
        correctGuesses: 1,
        averageSeconds: 8,
        averageHints: 0,
        averageReshuffles: 0
      },
      album: {
        played: 2,
        won: 1,
        gaveUp: 1,
        expired: 0,
        guesses: 3,
        correctGuesses: 1,
        averageSeconds: 15,
        averageHints: 1.5,
        averageReshuffles: 0
      },
      track: {
        played: 1,
        won: 0,
        gaveUp: 0,
        expired: 1,
        guesses: 1,
        correctGuesses: 0,
        averageSeconds: null,
        averageHints: 1,
        averageReshuffles: 1
      }
    }
  }))

  await jumbleProfileSubcommand.execute(
    partialFixture({
      app: { jumble: { profileSummary } },
      defer: vi.fn(async () => undefined),
      editResponse,
      interaction: { user: { id: 'user-1' } },
      options: {}
    })
  )

  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('Last.fm: `taskyliz`'))
  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('All: **6**'))
  expect(editResponse).toHaveBeenCalledWith(
    expect.stringContaining('Artists: **2** · Albums: **3** · Tracks: **1**')
  )
  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('All — Played **4**'))
  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('Artists — Played **1**'))
  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('Albums — Played **2**'))
  expect(editResponse).toHaveBeenCalledWith(expect.stringContaining('Tracks — Played **1**'))
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
    app: partialFixture({ moduleStore }),
    applicationID: 'app-1',
    client: partialFixture(client),
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
    app: partialFixture({ moduleStore }),
    applicationID: 'app-1',
    client: partialFixture(client),
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
  expect(ids.startSession).toBe('jumble/session/12345678-1234-4234-8234-123456789abc')
})
