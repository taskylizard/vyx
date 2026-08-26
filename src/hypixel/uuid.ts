/**
 * Hypixel's members map is keyed by undashed, lowercased UUIDs even though
 * callers (and .env) commonly use the dashed form. Accept either.
 */
export function normalizeUUID(uuid: string): string {
  return uuid.replaceAll('-', '').toLowerCase()
}

export function memberForUUID<M>(members: Record<string, M>, uuid: string): M | undefined {
  const direct = members[uuid]
  if (direct !== undefined) return direct
  return members[normalizeUUID(uuid)]
}
