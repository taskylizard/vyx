import { expect, test, vi } from 'vite-plus/test'
import type { KanikouEnv } from '../../src/config/env.ts'
import { isSkyblockAdvisorTarget, resolveSkyblockFeature } from '../../src/hypixel/advisor.ts'
import { partialFixture } from '../fixtures/partial.ts'

const UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COMPLETE = {
  HYPIXEL_API_KEY: 'hypixel-key',
  SKYBLOCK_CHANNEL_ID: 'channel-1',
  SKYBLOCK_DISCORD_USER_ID: 'user-1',
  SKYBLOCK_PLAYER_UUID: UUID
}

function logger() {
  return { warn: vi.fn() }
}

function message(authorID: string, channelID: string, guildID: string | null) {
  return { author: { id: authorID }, channelID, guildID }
}

test('stays disabled when no skyblock variable is configured', () => {
  const warn = logger()

  expect(resolveSkyblockFeature(partialFixture<KanikouEnv>({}), warn)).toBeUndefined()
  expect(warn.warn).not.toHaveBeenCalled()
})

test('disables with diagnostics when only some variables are set', () => {
  const warn = logger()

  const feature = resolveSkyblockFeature(
    partialFixture<KanikouEnv>({ SKYBLOCK_CHANNEL_ID: 'channel-1' }),
    warn
  )

  expect(feature).toBeUndefined()
  expect(warn.warn).toHaveBeenCalledWith(
    'skyblock advisor disabled: incomplete configuration',
    expect.objectContaining({
      missing: ['HYPIXEL_API_KEY', 'SKYBLOCK_DISCORD_USER_ID', 'a valid SKYBLOCK_PLAYER_UUID']
    })
  )
})

test('rejects malformed player uuids', () => {
  const warn = logger()

  const feature = resolveSkyblockFeature(
    partialFixture<KanikouEnv>({ ...COMPLETE, SKYBLOCK_PLAYER_UUID: 'not-a-uuid' }),
    warn
  )

  expect(feature).toBeUndefined()
  expect(warn.warn).toHaveBeenCalledWith('skyblock advisor disabled: incomplete configuration', {
    missing: ['a valid SKYBLOCK_PLAYER_UUID']
  })
})

test('builds the advisor feature when fully configured', () => {
  const feature = resolveSkyblockFeature(
    partialFixture<KanikouEnv>({ ...COMPLETE, SKYBLOCK_PROFILE_NAME: '  Zucchini  ' }),
    logger()
  )

  expect(feature?.advisor).toEqual({
    identity: { playerUUID: UUID, profileName: 'Zucchini' },
    scope: { channelID: 'channel-1', userID: 'user-1' }
  })
  expect(feature?.client).toBeDefined()
})

test('matches only the configured channel and user inside a guild', () => {
  const env = partialFixture<KanikouEnv>(COMPLETE)

  expect(isSkyblockAdvisorTarget(env, message('user-1', 'channel-1', 'guild-1'))).toBe(true)
  expect(isSkyblockAdvisorTarget(env, message('user-2', 'channel-1', 'guild-1'))).toBe(false)
  expect(isSkyblockAdvisorTarget(env, message('user-1', 'channel-2', 'guild-1'))).toBe(false)
  expect(isSkyblockAdvisorTarget(env, message('user-1', 'channel-1', null))).toBe(false)
})

test('ignores unset channel or user configuration entirely', () => {
  const env = partialFixture<KanikouEnv>({
    SKYBLOCK_CHANNEL_ID: 'channel-1',
    SKYBLOCK_DISCORD_USER_ID: undefined
  })

  expect(
    isSkyblockAdvisorTarget(env, {
      author: { id: 'user-1' },
      channelID: 'channel-1',
      guildID: 'guild-1'
    })
  ).toBe(false)
})
