import type { ToolSet } from 'ai'
import { expect, test, vi } from 'vite-plus/test'
import { HypixelClient } from '../../src/hypixel/client.ts'
import type { HypixelItem, SkyblockProfile } from '../../src/hypixel/schemas.ts'
import {
  createHypixelTools,
  executeSkyblockOverview,
  formatItemSearchReport,
  isSkyblockAdvisorScope,
  SKYBLOCK_BAZAAR_TOOL_NAME,
  SKYBLOCK_ITEMS_TOOL_NAME,
  SKYBLOCK_OVERVIEW_TOOL_NAME,
  SkyblockAdvisorToolProvider
} from '../../src/llm/tools/hypixel.ts'
import type { ToolScope } from '../../src/llm/mintlify-mcp-types.ts'
import type { ItemIndexEntry } from '../../src/hypixel/market.ts'
import { partialFixture } from '../fixtures/partial.ts'

const UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SCOPE = { channelID: 'channel-1', userID: 'user-1' }

function stubClient(overrides: Partial<HypixelClient> = {}) {
  const player = vi.fn(async () => ({ displayname: 'tasky' }))
  const activeProfile = vi.fn(async (): Promise<SkyblockProfile | undefined> => profileFixture())
  const skills = vi.fn(async (): Promise<Record<string, unknown>> => ({}))
  const bazaar = vi.fn(async (): Promise<Record<string, unknown>> => ({}))
  const items = vi.fn(async (): Promise<HypixelItem[]> => [])
  const client = partialFixture<HypixelClient>({
    activeProfile,
    bazaar,
    items,
    player,
    skills,
    ...overrides
  })
  return { activeProfile, bazaar, client, items, player, skills }
}

function profileFixture(): SkyblockProfile {
  return {
    banking: null,
    cute_name: 'Zucchini',
    game_mode: null,
    members: {
      [UUID]: {
        last_save: Date.UTC(2026, 0, 15),
        leveling: { experience: 123_456 },
        player_data: { experience: { SKILL_COMBAT: 150 } }
      }
    },
    profile_id: 'p1',
    selected: true
  }
}

function toolScope(overrides: Partial<ToolScope> = {}): ToolScope {
  return {
    canManageServer: false,
    guildID: 'guild-1',
    sourceID: 'source-1',
    ...SCOPE,
    ...overrides
  }
}

async function executeTool(tools: ToolSet, name: string, input: unknown): Promise<unknown> {
  const execute = tools[name]?.execute
  if (execute === undefined) {
    throw new Error(`Tool ${name} is not executable.`)
  }
  return execute(input, { context: {}, messages: [], toolCallId: `test-${name}` })
}

test('the provider serves tools and instructions only inside its scope', async () => {
  const provider = new SkyblockAdvisorToolProvider({
    client: stubClient().client,
    identity: { playerUUID: UUID, profileName: 'Zucchini' },
    scope: SCOPE
  })

  const outside = await provider.resolve(toolScope({ userID: 'someone-else' }))
  expect(outside.tools).toEqual({})
  expect(outside.instructions).toBeUndefined()

  const inside = await provider.resolve(toolScope())
  expect(Object.keys(inside.tools)).toEqual([
    SKYBLOCK_OVERVIEW_TOOL_NAME,
    SKYBLOCK_BAZAAR_TOOL_NAME,
    SKYBLOCK_ITEMS_TOOL_NAME
  ])
  expect(inside.instructions).toContain(UUID)
  expect(inside.instructions).toContain('"Zucchini"')
})

test('scope matching requires the guild, channel, and user to line up', () => {
  expect(isSkyblockAdvisorScope(SCOPE, toolScope())).toBe(true)
  expect(isSkyblockAdvisorScope(SCOPE, toolScope({ guildID: null }))).toBe(false)
  expect(isSkyblockAdvisorScope(SCOPE, toolScope({ channelID: 'other' }))).toBe(false)
  expect(isSkyblockAdvisorScope(SCOPE, toolScope({ userID: 'other' }))).toBe(false)
})

test('the overview tool renders the digest for the resolved profile', async () => {
  const stub = stubClient()
  stub.skills.mockImplementation(async () => ({
    COMBAT: {
      levels: [
        { level: 1, totalExpRequired: 50 },
        { level: 2, totalExpRequired: 150 }
      ]
    }
  }))
  const tools = createHypixelTools({ client: stub.client, identity: { playerUUID: UUID } })

  const digest = String(await executeTool(tools, SKYBLOCK_OVERVIEW_TOOL_NAME, {}))

  expect(digest).toContain('profile **Zucchini** · selected')
  expect(digest).toContain('Skills: Combat 2')
  expect(stub.player).toHaveBeenCalledWith(UUID)
  expect(stub.activeProfile).toHaveBeenCalledWith(UUID, undefined)
})

test('the overview tool explains when no profile is visible', async () => {
  const stub = stubClient()
  stub.activeProfile.mockImplementation(async () => undefined)
  stub.skills.mockImplementation(async () => {
    throw new Error('offline')
  })

  const digest = await executeSkyblockOverview({
    client: stub.client,
    identity: { playerUUID: UUID, profileName: 'Zucchini' }
  })

  expect(digest).toContain('No Skyblock profiles are visible')
  expect(digest).not.toContain('offline')
})

test('the bazaar tool combines live products with the item index', async () => {
  const stub = stubClient()
  stub.bazaar.mockImplementation(async () => ({ PET_DRAGON: { product_id: 'PET_DRAGON' } }))
  stub.items.mockImplementation(
    async () =>
      [
        {
          category: 'MISC',
          id: 'PET_DRAGON',
          name: 'Golden Dragon',
          npc_sell_price: 100,
          tier: 'LEGENDARY'
        }
      ] satisfies HypixelItem[]
  )
  const tools = createHypixelTools({ client: stub.client, identity: { playerUUID: UUID } })

  const report = String(
    await executeTool(tools, SKYBLOCK_BAZAAR_TOOL_NAME, { query: 'golden dragon' })
  )

  expect(report).toContain('**Golden Dragon** (`PET_DRAGON`)')
})

test('the item search tool resolves display names to ids', async () => {
  const stub = stubClient()
  stub.items.mockImplementation(
    async () =>
      [{ id: 'ENCHANTED_COBBLESTONE', name: 'Enchanted Cobblestone' }] satisfies HypixelItem[]
  )
  const tools = createHypixelTools({ client: stub.client, identity: { playerUUID: UUID } })

  const report = String(
    await executeTool(tools, SKYBLOCK_ITEMS_TOOL_NAME, { query: 'enchanted cobble' })
  )

  expect(report).toContain('- **Enchanted Cobblestone**: ENCHANTED_COBBLESTONE')
})

test('formats empty item searches with the query echoed back', () => {
  const index: ItemIndexEntry[] = []

  expect(formatItemSearchReport(index, 'midas staff')).toBe('No items match "midas staff".')
})
