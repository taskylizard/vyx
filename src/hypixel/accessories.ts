import { gunzipSync } from 'node:zlib'
import nbt from 'prismarine-nbt'

const RARITY_FROM_LORE_RE =
  /(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC|DIVINE|SPECIAL) ACCESSORY$/u

export interface ParsedAccessory {
  displayName: string
  id: string
  rarity: string | undefined
}

export interface TalismanBagSummary {
  accessories: ParsedAccessory[]
  byRarity: Record<string, number>
}

/**
 * Decodes the Base64 gzipped NBT talisman bag. Returns undefined on any
 * failure so the digest can fall back to the MP value alone.
 */
export async function parseTalismanBag(
  data: string | undefined
): Promise<TalismanBagSummary | undefined> {
  if (data === undefined || data.length === 0) return undefined

  try {
    const decompressed = gunzipSync(Buffer.from(data, 'base64'))
    const { parsed } = await nbt.parse(decompressed)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tasky: simplify returns plain JS from external NBT
    const simplified = nbt.simplify(parsed) as {
      i?: Array<{
        Count?: number
        id?: string
        tag?: { display?: { Lore?: string[]; Name?: string }; ExtraAttributes?: { id?: string } }
      }>
    }
    const items: Array<{
      Count?: number
      id?: string
      tag?: { display?: { Lore?: string[]; Name?: string }; ExtraAttributes?: { id?: string } }
    }> = simplified.i ?? []
    const accessories: ParsedAccessory[] = []

    for (const item of items) {
      if ((item.Count ?? 0) === 0) continue
      const id = item.tag?.ExtraAttributes?.id ?? item.id ?? 'unknown'
      if (id === 'unknown') continue
      const lore: string[] = item.tag?.display?.Lore ?? []
      const rarity = lore.length === 0 ? undefined : parseRarity(lore.at(-1) ?? '')
      const displayName = item.tag?.display?.Name?.replaceAll(/§./gu, '') ?? id
      accessories.push({ displayName, id, rarity })
    }

    if (accessories.length === 0) return undefined

    const byRarity: Record<string, number> = {}
    for (const accessory of accessories) {
      const key = accessory.rarity ?? 'unknown'
      byRarity[key] = (byRarity[key] ?? 0) + 1
    }

    return { accessories, byRarity }
  } catch {
    return undefined
  }
}

function parseRarity(lastLoreLine: string): string | undefined {
  const cleaned = lastLoreLine.replaceAll(/§./gu, '').trim()
  const match = RARITY_FROM_LORE_RE.exec(cleaned)
  return match?.[1]?.toLowerCase()
}
