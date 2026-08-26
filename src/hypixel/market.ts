import { formatCompact } from '../shared/numbers.ts'
import type { BazaarOrder, BazaarProduct, HypixelItem } from './schemas.ts'

export interface ItemIndexEntry {
  category: string | undefined
  id: string
  name: string
  npcSellPrice: number | undefined
  tier: string | undefined
}

const MAX_ITEM_MATCHES = 10
const MAX_BAZAAR_MATCHES = 8

export function buildItemIndex(items: readonly HypixelItem[]): ItemIndexEntry[] {
  return items.map((item) => ({
    category: item.category,
    id: item.id,
    name: item.name ?? item.id,
    npcSellPrice: item.npc_sell_price,
    tier: item.tier
  }))
}

/**
 * Finds items whose id or display name matches the query. Exact ids win, then
 * prefixes, then substring matches; ties keep resource order.
 */
export function searchItemIndex(
  index: readonly ItemIndexEntry[],
  query: string,
  limit = MAX_ITEM_MATCHES
): ItemIndexEntry[] {
  const normalized = normalizeQuery(query)
  if (normalized.length === 0) return []

  const scored = index
    .map((entry) => ({ entry, score: itemMatchScore(entry, normalized) }))
    .filter((candidate) => candidate.score > 0)

  return scored
    .toSorted((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((candidate) => candidate.entry)
}

/** Formats a bounded Markdown report of bazaar products matching the query. */
export function formatBazaarReport(
  products: Readonly<Record<string, BazaarProduct>>,
  itemIndex: readonly ItemIndexEntry[],
  query: string
): string {
  const normalized = normalizeQuery(query)
  if (normalized.length === 0) return 'No product given.'

  const byId = new Map(itemIndex.map((entry) => [entry.id, entry]))
  const matches = matchBazaarProducts(products, itemIndex, normalized).slice(0, MAX_BAZAAR_MATCHES)
  if (matches.length === 0) {
    return `No bazaar product matches "${query}". Bazaar-traded items only; try skyblockItemSearch first for the exact id.`
  }

  return matches
    .map((product) => {
      const name = byId.get(product.product_id)?.name ?? product.product_id
      return [`**${name}** (\`${product.product_id}\`)`, describeBazaarStatus(product)].join('\n')
    })
    .join('\n\n')
}

function matchBazaarProducts(
  products: Readonly<Record<string, BazaarProduct>>,
  itemIndex: readonly ItemIndexEntry[],
  normalized: string
): BazaarProduct[] {
  const matchedIds = new Set<string>()

  for (const entry of searchItemIndex(itemIndex, normalized, MAX_BAZAAR_MATCHES)) {
    matchedIds.add(entry.id)
  }
  for (const productId of Object.keys(products)) {
    if (productId.toLowerCase().includes(normalized)) matchedIds.add(productId)
  }

  return [...matchedIds]
    .filter((productId) => Object.hasOwn(products, productId))
    .map((productId) => products[productId])
    .toSorted((first, second) => second.product_id.length - first.product_id.length)
}

function describeBazaarStatus(product: BazaarProduct): string {
  const status = product.quick_status
  if (status === undefined) return 'No live order data.'

  const parts = [
    `insta-buy ${formatCompact(status.sellPrice ?? 0)}`,
    `insta-sell ${formatCompact(status.buyPrice ?? 0)}`
  ]

  const orders =
    status.buyOrders !== undefined || status.sellOrders !== undefined
      ? `${status.buyOrders ?? 0} buy / ${status.sellOrders ?? 0} sell orders`
      : undefined
  if (orders !== undefined) parts.push(orders)

  const weekly =
    status.buyMovingWeek !== undefined || status.sellMovingWeek !== undefined
      ? `${formatCompact(status.buyMovingWeek ?? 0)} bought / ${formatCompact(
          status.sellMovingWeek ?? 0
        )} sold this week`
      : undefined
  if (weekly !== undefined) parts.push(weekly)

  const lines = [parts.join(' · ')]
  const bestSellOrder = topOrder(product.sell_summary)
  const bestBuyOrder = topOrder(product.buy_summary)
  if (bestSellOrder !== undefined || bestBuyOrder !== undefined) {
    lines.push(describeTopOrders(bestBuyOrder, bestSellOrder))
  }

  return lines.join('\n')
}

function describeTopOrders(buy: BazaarOrder | undefined, sell: BazaarOrder | undefined): string {
  const buyPart =
    buy === undefined
      ? undefined
      : `top buy ${buy.pricePerUnit.toFixed(1)} ×${formatCompact(buy.amount)}`
  const sellPart =
    sell === undefined
      ? undefined
      : `top sell ${sell.pricePerUnit.toFixed(1)} ×${formatCompact(sell.amount)}`
  return [buyPart, sellPart].filter((part) => part !== undefined).join(' · ')
}

function topOrder(orders: readonly BazaarOrder[] | undefined): BazaarOrder | undefined {
  return orders?.toSorted((first, second) => second.amount - first.amount)[0]
}

function itemMatchScore(entry: ItemIndexEntry, normalized: string): number {
  const id = entry.id.toLowerCase()
  const name = entry.name.toLowerCase()

  if (id === normalized) return 6
  if (name === normalized) return 5
  if (id.startsWith(normalized)) return 4
  if (name.startsWith(normalized)) return 3
  if (id.includes(normalized)) return 2
  if (name.includes(normalized)) return 1
  return 0
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}
