import { expect, test } from 'vite-plus/test'
import { buildItemIndex, formatBazaarReport, searchItemIndex } from '../../src/hypixel/market.ts'
import { formatItemSearchReport } from '../../src/llm/tools/hypixel.ts'
import type { BazaarProduct, HypixelItem } from '../../src/hypixel/schemas.ts'

const ITEMS: HypixelItem[] = [
  {
    category: 'MISC',
    id: 'ENCHANTED_COBBLESTONE',
    name: 'Enchanted Cobblestone',
    npc_sell_price: 8,
    tier: 'UNCOMMON'
  },
  { category: 'BLOCKS', id: 'COBBLESTONE', name: 'Cobblestone', npc_sell_price: 1, tier: 'COMMON' },
  { category: 'MISC', id: 'ENCHANTED_COBBLESTONE_9', name: 'Super Compactor Cobble', tier: 'RARE' },
  { id: 'PET_DRAGON', name: 'Golden Dragon' }
]

function product(id: string, buyPrice: number, sellPrice: number): BazaarProduct {
  return {
    buy_summary: [{ amount: 640, orders: 3, pricePerUnit: buyPrice }],
    product_id: id,
    quick_status: {
      buyMovingWeek: 900_000,
      buyOrders: 12,
      buyPrice: buyPrice,
      sellMovingWeek: 1_100_000,
      sellOrders: 30,
      sellPrice: sellPrice
    },
    sell_summary: [{ amount: 1280, orders: 5, pricePerUnit: sellPrice }]
  }
}

test('ranks exact ids and names above partial matches', () => {
  const index = buildItemIndex(ITEMS)
  const ids = searchItemIndex(index, 'cobblestone').map((entry) => entry.id)

  expect(ids).toEqual(['COBBLESTONE', 'ENCHANTED_COBBLESTONE', 'ENCHANTED_COBBLESTONE_9'])
})

test('matches display names case-insensitively and keeps unknown queries empty', () => {
  const index = buildItemIndex(ITEMS)

  expect(searchItemIndex(index, 'golden dragon').map((entry) => entry.id)).toEqual(['PET_DRAGON'])
  expect(searchItemIndex(index, 'nonexistent thing')).toEqual([])
})

test('formats item search results with rarity, category, and npc price', () => {
  const report = formatBazaarItemSearch('cobble')

  expect(report).toContain('- **Cobblestone**: COBBLESTONE · common · blocks · NPC sell 1')
  expect(report).toContain(
    '- **Enchanted Cobblestone**: ENCHANTED_COBBLESTONE · uncommon · misc · NPC sell 8'
  )
})

test('reports no matches for unknown item queries', () => {
  expect(formatBazaarItemSearch('zzz')).toBe('No items match "zzz".')
})

test('resolves bazaar products through item names and reports live prices', () => {
  const products = {
    COBBLESTONE: product('COBBLESTONE', 2.4, 2.1),
    ENCHANTED_COBBLESTONE: product('ENCHANTED_COBBLESTONE', 320, 300)
  }
  const report = formatBazaarReport(products, buildItemIndex(ITEMS), 'enchanted cobblestone')

  expect(report).toContain('**Enchanted Cobblestone** (`ENCHANTED_COBBLESTONE`)')
  expect(report).toContain('insta-buy 300 · insta-sell 320')
  expect(report).toContain('12 buy / 30 sell orders')
  expect(report).toContain('900k bought / 1.1M sold this week')
  expect(report).toContain('top buy 320.0 ×640 · top sell 300.0 ×1.3k')
})

test('guides toward exact ids when no bazaar product matches', () => {
  const report = formatBazaarReport(
    { COBBLESTONE: product('COBBLESTONE', 2, 1) },
    buildItemIndex(ITEMS),
    'golden dragon'
  )

  expect(report).toContain('No bazaar product matches')
})

function formatBazaarItemSearch(query: string): string {
  return formatItemSearchReport(buildItemIndex(ITEMS), query)
}
