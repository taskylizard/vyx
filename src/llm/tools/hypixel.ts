import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { HypixelClient } from '../../hypixel/client.ts'
import { buildOverviewDigest } from '../../hypixel/digest.ts'
import { buildItemIndex, formatBazaarReport, searchItemIndex } from '../../hypixel/market.ts'
import type { ItemIndexEntry } from '../../hypixel/market.ts'
import { memberForUUID } from '../../hypixel/uuid.ts'
import type { ScopedToolProvider, ScopedToolSet, ToolScope } from '../mintlify-mcp-types.ts'

export const SKYBLOCK_OVERVIEW_TOOL_NAME = 'skyblockOverview'
export const SKYBLOCK_BAZAAR_TOOL_NAME = 'skyblockBazaar'
export const SKYBLOCK_ITEMS_TOOL_NAME = 'skyblockItemSearch'

export interface SkyblockIdentity {
  playerUUID: string
  profileName?: string
}

export interface SkyblockAdvisorScope {
  channelID: string
  userID: string
}

export interface SkyblockAdvisorConfig {
  identity: SkyblockIdentity
  scope: SkyblockAdvisorScope
}

export interface CreateHypixelToolsConfig {
  client: HypixelClient
  identity: SkyblockIdentity
}

export function createHypixelTools(config: CreateHypixelToolsConfig): ToolSet {
  const getItemIndex = memoizeItemIndex(config.client)

  return {
    [SKYBLOCK_OVERVIEW_TOOL_NAME]: tool({
      description:
        'Snapshot of the player’s current Skyblock profile: skills, slayer, dungeons, Heart of the Mountain, pets, bank, purse, fairy souls, minions. Call this whenever an answer needs current in-game numbers instead of guessing.',
      execute: async () => executeSkyblockOverview(config),
      inputSchema: z.object({}).describe('No arguments.'),
      outputSchema: z.string(),
      toModelOutput: ({ output }) => ({ type: 'text', value: output })
    }),
    [SKYBLOCK_BAZAAR_TOOL_NAME]: tool({
      description:
        'Live bazaar prices for items whose id or name matches the query. Reports insta-buy price (what buying now costs), insta-sell price (what selling now pays), order counts, weekly volume, and top orders.',
      execute: async ({ query }) => {
        const [products, index] = await Promise.all([config.client.bazaar(), getItemIndex()])
        return formatBazaarReport(products, index, query)
      },
      inputSchema: z.object({
        query: z.string().min(1).describe('Item name or id, e.g. "enchanted cobblestone".')
      }),
      outputSchema: z.string(),
      toModelOutput: ({ output }) => ({ type: 'text', value: output })
    }),
    [SKYBLOCK_ITEMS_TOOL_NAME]: tool({
      description:
        'Search all known Skyblock items by name or id fragment. Resolves display names to ids (for bazaar lookups) and shows rarity, category, and NPC sell price.',
      execute: async ({ query }) => {
        const index = await getItemIndex()
        return formatItemSearchReport(index, query)
      },
      inputSchema: z.object({
        query: z.string().min(1).describe('Fragment of the item name or id.')
      }),
      outputSchema: z.string(),
      toModelOutput: ({ output }) => ({ type: 'text', value: output })
    })
  }
}

export async function executeSkyblockOverview(config: CreateHypixelToolsConfig): Promise<string> {
  const { playerUUID } = config.identity
  const [player, profile, skillDefinitions] = await Promise.all([
    config.client.player(playerUUID),
    config.client.activeProfile(playerUUID, config.identity.profileName),
    config.client.skills().catch(() => undefined)
  ])

  if (profile === undefined) {
    return 'No Skyblock profiles are visible for this account. Ask the player to enable Skyblock API sharing in the Hypixel settings.'
  }

  const member = memberForUUID(profile.members, playerUUID)
  return buildOverviewDigest({ member, player, playerUUID, profile, skillDefinitions })
}

export function formatItemSearchReport(index: readonly ItemIndexEntry[], query: string): string {
  const matches = searchItemIndex(index, query)
  if (matches.length === 0) return `No items match "${query}".`

  return matches.map(describeItemEntry).join('\n')
}

export function isSkyblockAdvisorScope(
  expected: SkyblockAdvisorScope,
  scope: Pick<ToolScope, 'channelID' | 'guildID' | 'userID'>
): boolean {
  return (
    scope.guildID !== null &&
    scope.channelID === expected.channelID &&
    scope.userID === expected.userID
  )
}

/** Serves the Skyblock advisor tools and instructions only inside its scope. */
export class SkyblockAdvisorToolProvider implements ScopedToolProvider {
  readonly #config: SkyblockAdvisorConfig
  readonly #tools: ToolSet

  constructor(options: SkyblockAdvisorConfig & { client: HypixelClient }) {
    this.#config = { identity: options.identity, scope: options.scope }
    this.#tools = createHypixelTools(options)
  }

  async resolve(scope: ToolScope): Promise<ScopedToolSet> {
    if (!isSkyblockAdvisorScope(this.#config.scope, scope)) return { tools: {} }

    const profilePart =
      this.#config.identity.profileName === undefined
        ? 'the selected profile'
        : `the "${this.#config.identity.profileName}" profile`
    return {
      instructions: [
        'You are this player’s personal Hypixel Skyblock advisor in their dedicated channel.',
        `Their account is fixed: player UUID \`${this.#config.identity.playerUUID}\`, ${profilePart}.`,
        `Call ${SKYBLOCK_OVERVIEW_TOOL_NAME} whenever an answer depends on current in-game stats; never guess numbers.`,
        `${SKYBLOCK_BAZAAR_TOOL_NAME} reports bazaar prices: insta-buy is the cheapest sell order (cost to buy now), insta-sell is the best buy order (payout when selling now).`,
        `Use ${SKYBLOCK_ITEMS_TOOL_NAME} to resolve display names to ids or check NPC sell prices.`,
        'For meta questions such as best weapons, armor, or progression routes, use the regular web search tools and cite sources as usual. Profile data can lag live game state by a few minutes.',
        'Keep advice short, concrete, and actionable: name exact items, prices, and next steps.'
      ].join('\n\n'),
      tools: this.#tools
    }
  }
}

function describeItemEntry(entry: ItemIndexEntry): string {
  const parts = [
    entry.id,
    entry.tier?.toLowerCase(),
    entry.category?.toLowerCase(),
    entry.npcSellPrice === undefined ? undefined : `NPC sell ${entry.npcSellPrice}`
  ].filter((part) => part !== undefined)

  return `- **${entry.name}**: ${parts.join(' · ')}`
}

function memoizeItemIndex(client: HypixelClient): () => Promise<ItemIndexEntry[]> {
  let promise: Promise<ItemIndexEntry[]> | undefined

  return () => {
    promise ??= client
      .items()
      .then(buildItemIndex)
      .catch((error: unknown) => {
        promise = undefined
        throw error
      })
    return promise
  }
}
