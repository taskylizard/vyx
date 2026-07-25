import { afterEach, beforeEach, expect, test } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { GuildSettingsStore } from '../../src/database/guild-settings.ts'

let database: ReturnType<typeof createKanikouDatabase>
let store: GuildSettingsStore

beforeEach(async () => {
  database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  store = new GuildSettingsStore(database.db)
})

afterEach(() => {
  database.close()
})

test('defaults every guild to no enabled modules', async () => {
  await expect(store.read({ applicationID: 'app-1', guildID: 'guild-1' })).resolves.toEqual([])
  await expect(
    store.isEnabled({ applicationID: 'app-1', guildID: 'guild-1', module: 'jumble' })
  ).resolves.toBe(false)
})

test('atomically merges concurrent module changes and reports no-op toggles', async () => {
  const otherProcess = new GuildSettingsStore(database.db)
  await Promise.all([
    store.mutate({ applicationID: 'app-1', guildID: 'guild-1', enabled: true, module: 'jumble' }),
    otherProcess.mutate({
      applicationID: 'app-1',
      guildID: 'guild-1',
      enabled: true,
      module: 'other'
    })
  ])

  expect(await store.read({ applicationID: 'app-1', guildID: 'guild-1' })).toEqual(
    expect.arrayContaining(['jumble', 'other'])
  )
  await expect(
    store.mutate({ applicationID: 'app-1', guildID: 'guild-1', enabled: true, module: 'jumble' })
  ).resolves.toMatchObject({ changed: false })
  await expect(
    store.mutate({ applicationID: 'app-1', guildID: 'guild-1', enabled: false, module: 'jumble' })
  ).resolves.toMatchObject({ changed: true, modules: ['other'] })
})

test('stores Rosepack command ownership without replacing enabled modules', async () => {
  const scope = { applicationID: 'app-1', guildID: 'guild-1' }
  await store.mutate({ ...scope, enabled: true, module: 'jumble' })
  await store.writeOwnedCommandKeys({ ...scope, keys: ['1:jumble', '1:jumble'] })

  await expect(store.read(scope)).resolves.toEqual(['jumble'])
  await expect(store.readOwnedCommandKeys(scope)).resolves.toEqual(['1:jumble'])
})
