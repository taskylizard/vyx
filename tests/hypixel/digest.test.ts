import { expect, test } from 'vite-plus/test'
import {
  buildOverviewDigest,
  buildSkillThresholdTable,
  skillProgress
} from '../../src/hypixel/digest.ts'
import type { HypixelPlayer, SkyblockProfile } from '../../src/hypixel/schemas.ts'

const SKILL_DEFINITIONS = {
  COMBAT: {
    levels: [
      { level: 1, totalExpRequired: 50 },
      { level: 2, totalExpRequired: 150 }
    ]
  },
  FARMING: {
    levels: [
      { level: 1, totalExpRequired: 50 },
      { level: 2, totalExpRequired: 150 }
    ]
  }
}

const MEMBER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LAST_SAVE_MS = Date.UTC(2026, 0, 15, 12, 30)

function playerFixture(): HypixelPlayer {
  return { displayname: 'tasky' }
}

function profileFixture(memberOverrides: Record<string, unknown> = {}): SkyblockProfile {
  return {
    banking: { balance: 1_234_000_000 },
    cute_name: 'Zucchini',
    game_mode: 'ironman',
    members: {
      [MEMBER_UUID]: {
        crafted_generators: ['MINER_ZOMBIE_1', 'MINER_ZOMBIE_1', 'FARMER_WHEAT_4'],
        dungeons: {
          dungeon_types: {
            catacombs: { experience: 1_100_000_000, highest_tier_completed: 7 },
            master_catacombs: { experience: 210_000_000 }
          },
          player_classes: {
            archer: { experience: 900_000_000 },
            mage: { experience: 2_000_000_000 }
          },
          selected_dungeon_class: 'mage',
          secrets_found: 4321
        },
        fairy_souls: { total_collected: 230 },
        last_save: LAST_SAVE_MS,
        leveling: { experience: 1_234_567_890 },
        mining_core: {
          experience: 45_600_000,
          nodes: { special: 7 },
          powders: { gemstone: 250_000, mithril: 1_200_000 }
        },
        nether_island_player_data: { kuudra_completed_tiers: { furious: 5, none: 10 } },
        pets_data: {
          pets: [
            { exp: 50_000_000, tier: 'LEGENDARY', type: 'GOLDEN_DRAGON' },
            { exp: 40_000_000, tier: 'EPIC', type: 'ENDERMAN' },
            { exp: 30_000_000, tier: 'RARE', type: 'BAL' },
            { exp: 10, tier: 'COMMON', type: 'BEE' }
          ]
        },
        player_data: {
          accessory_bag: { highest_magical_power: 1200 },
          currency: { coin_purse: 45_600_000 },
          experience: { SKILL_COMBAT: 150, SKILL_FARMING: 60, SKILL_SOCIAL: 5000 }
        },
        slayer: {
          slayer_bosses: {
            enderman: { xp: 300_000 },
            zombie: { xp: 1_200_000 }
          }
        },
        ...memberOverrides
      }
    },
    profile_id: 'profile-1',
    selected: true
  }
}

function digestFor(
  profile: SkyblockProfile,
  player: HypixelPlayer = playerFixture(),
  skillDefinitions: Record<string, never> | typeof SKILL_DEFINITIONS = SKILL_DEFINITIONS
): Promise<string> {
  return buildOverviewDigest({
    member: Object.hasOwn(profile.members, MEMBER_UUID) ? profile.members[MEMBER_UUID] : undefined,
    player,
    playerUUID: MEMBER_UUID,
    profile,
    skillDefinitions
  })
}

test('computes skill levels from cumulative resource thresholds', () => {
  const table = buildSkillThresholdTable(SKILL_DEFINITIONS)
  const combat = table.get('COMBAT') ?? []

  expect(skillProgress(0, combat)).toMatchObject({ cap: 2, level: 0 })
  expect(skillProgress(50, combat)).toMatchObject({ level: 1, xpIntoLevel: 0 })
  expect(skillProgress(149, combat)).toMatchObject({ level: 1, xpForNextLevel: 100 })
  expect(skillProgress(200, combat)).toMatchObject({ cap: 2, level: 2, xpForNextLevel: 0 })
})

test('renders a full snapshot with computed skills and compact numbers', async () => {
  const digest = await digestFor(profileFixture())

  expect(digest).toContain(
    '**tasky** · profile **Zucchini** · selected · ironman · saved 2026-01-15'
  )
  expect(digest).toContain('SkyBlock XP: 1.2B')
  expect(digest).toContain('Bank: 1.2B coins · Purse: 45.6M coins')
  expect(digest).toContain('Fairy souls: 230')
  expect(digest).toContain('Magical power: 1200')
  expect(digest).toContain('Skills: Combat 2, Farming 1/2, Social 5k xp')
  expect(digest).toContain('Slayer: Zombie 1.2M xp, Enderman 300k xp')
  expect(digest).toContain('Catacombs: 1.1B xp · best tier 7')
  expect(digest).toContain('Master Catacombs: 210M xp')
  expect(digest).toContain('Classes: Mage 2B, Archer 900M')
  expect(digest).toContain('Secrets found: 4321')
  expect(digest).toContain('Heart of the Mountain: tier 7 · 45.6M xp · Gemstone 250k, Mithril 1.2M')
  expect(digest).toContain('Pets (4): Golden Dragon (legendary), Enderman (epic), Bal (rare)')
  expect(digest).toContain('Unique minions crafted: 2')
  expect(digest).toContain('Kuudra completions: 15')
})

test('falls back to raw skill xp when thresholds are unavailable', async () => {
  const digest = await digestFor(profileFixture(), playerFixture(), {})

  expect(digest).toContain('Skills: Combat 150 xp, Farming 60 xp, Social 5k xp')
})

test('reports missing member data instead of throwing', async () => {
  const profile = profileFixture()
  delete (profile.members as Record<string, unknown>)[MEMBER_UUID]

  expect(await digestFor(profile)).toContain('Member data is unavailable')
})
