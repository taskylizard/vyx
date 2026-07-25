import { Permission, Permissions } from 'oceanic.js'
import { expect, test } from 'vite-plus/test'
import { rosepack } from '../../src/bot/rosepack.ts'
import { slashCommands } from '../../src/commands/index.ts'
import { componentIds, jumbleComponents } from '../../src/jumble/components.ts'
import { jumblePermissionError } from '../../src/jumble/discord.ts'

test('registers the Jumble commands and non-ambiguous component routes', () => {
  const registry = rosepack.createRegistry({ components: jumbleComponents, slashCommands })
  const names = registry.payload.map((command) => command.name)
  expect(names).toContain('jumble')
  expect(names).not.toContain('jumble-profile')
  expect(names).not.toContain('jumble-stats')
  expect(registry.payload.find((command) => command.name === 'jumble')).toMatchObject({
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

test('builds compact routed IDs for every game control', () => {
  const ids = componentIds('12345678-1234-4234-8234-123456789abc')
  expect(ids.hint).toBe('jumble/hint/12345678-1234-4234-8234-123456789abc')
  expect(ids.unblur).toContain('jumble/unblur/')
  expect(ids.reshuffle).toContain('jumble/reshuffle/')
  expect(ids.giveUp).toContain('jumble/give-up/')
  expect(ids.replay('track')).toBe('jumble/replay/track')
})
