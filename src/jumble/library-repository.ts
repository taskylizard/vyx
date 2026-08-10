import { and, asc, eq, exists, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import {
  jumbleLibraryItems,
  jumbleLibraryMetadata,
  jumbleLibrarySync
} from '../database/schemas/jumble.ts'
import { jumbleCandidateIdentityKey, mergeJumbleCandidates } from './candidate.ts'
import { JumbleCandidateSchema } from './schemas.ts'
import type { JumbleRepositoryDatabase } from './repository.ts'
import type { JumbleCandidate, JumbleKind, JumbleTrackedCounts } from './types.ts'

export interface LibrarySnapshot {
  candidates: JumbleCandidate[]
  refreshAfter: number | null
}

type JumbleKindTrackedCounts = Omit<JumbleTrackedCounts, 'all'>

export class JumbleLibraryRepository {
  constructor(private readonly db: JumbleRepositoryDatabase) {}

  async read(
    discordUserId: string,
    kind: JumbleKind,
    canonicalUsername: string
  ): Promise<LibrarySnapshot> {
    const state = await this.db
      .select({
        activeRefreshVersion: jumbleLibrarySync.activeRefreshVersion,
        refreshAfter: jumbleLibrarySync.refreshAfter
      })
      .from(jumbleLibrarySync)
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.canonicalUsername, canonicalUsername)
        )
      )
      .limit(1)
    const activeRefreshVersion = state[0]?.activeRefreshVersion
    if (activeRefreshVersion === null)
      return { candidates: [], refreshAfter: state[0]?.refreshAfter ?? null }
    const rows = await this.db
      .select()
      .from(jumbleLibraryItems)
      .where(
        and(
          eq(jumbleLibraryItems.discordUserId, discordUserId),
          eq(jumbleLibraryItems.kind, kind),
          eq(jumbleLibraryItems.refreshVersion, activeRefreshVersion)
        )
      )
      .orderBy(asc(jumbleLibraryItems.rank))
    const metadataRows = await this.db
      .select()
      .from(jumbleLibraryMetadata)
      .where(
        and(
          eq(jumbleLibraryMetadata.discordUserId, discordUserId),
          eq(jumbleLibraryMetadata.kind, kind),
          eq(jumbleLibraryMetadata.canonicalUsername, canonicalUsername)
        )
      )
    const metadata = new Map<string, JumbleCandidate>()
    for (const row of metadataRows) {
      const parsed = parseCandidate(row.candidate, kind)
      if (parsed !== undefined) metadata.set(jumbleCandidateIdentityKey(parsed), parsed)
    }
    const candidates: JumbleCandidate[] = []
    const corrupt: string[] = []
    for (const row of rows) {
      const parsed = parseCandidate(row.candidate, kind)
      if (parsed === undefined) {
        corrupt.push(row.identityKey)
        continue
      }
      const enriched = metadata.get(jumbleCandidateIdentityKey(parsed))
      candidates.push(enriched === undefined ? parsed : mergeJumbleCandidates(parsed, enriched))
    }
    if (corrupt.length > 0) {
      await this.db
        .delete(jumbleLibraryItems)
        .where(
          and(
            eq(jumbleLibraryItems.discordUserId, discordUserId),
            eq(jumbleLibraryItems.kind, kind),
            eq(jumbleLibraryItems.refreshVersion, activeRefreshVersion)
          )
        )
      return { candidates: [], refreshAfter: 0 }
    }
    return { candidates, refreshAfter: state[0]?.refreshAfter ?? null }
  }

  async needsRefresh(
    discordUserId: string,
    kind: JumbleKind,
    canonicalUsername: string,
    now: number
  ): Promise<boolean> {
    const rows = await this.db
      .select({
        activeRefreshVersion: jumbleLibrarySync.activeRefreshVersion,
        refreshAfter: jumbleLibrarySync.refreshAfter
      })
      .from(jumbleLibrarySync)
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.canonicalUsername, canonicalUsername)
        )
      )
      .limit(1)
    const state = rows[0]
    return state === undefined || state.activeRefreshVersion === null || state.refreshAfter <= now
  }

  async trackedCounts(
    discordUserId: string,
    canonicalUsername: string
  ): Promise<JumbleKindTrackedCounts> {
    const rows = await this.db
      .select({
        kind: jumbleLibrarySync.kind,
        count: sql<number>`count(*)`
      })
      .from(jumbleLibrarySync)
      .innerJoin(
        jumbleLibraryItems,
        and(
          eq(jumbleLibraryItems.discordUserId, jumbleLibrarySync.discordUserId),
          eq(jumbleLibraryItems.kind, jumbleLibrarySync.kind),
          eq(jumbleLibraryItems.refreshVersion, jumbleLibrarySync.activeRefreshVersion)
        )
      )
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.canonicalUsername, canonicalUsername)
        )
      )
      .groupBy(jumbleLibrarySync.kind)

    const counts: JumbleKindTrackedCounts = { artist: 0, album: 0, track: 0 }
    for (const row of rows) {
      if (row.kind === 'artist' || row.kind === 'album' || row.kind === 'track') {
        counts[row.kind] = row.count
      }
    }
    return counts
  }

  async acquireLease(input: {
    discordUserId: string
    kind: JumbleKind
    username: string
    owner: string
    now: number
    leaseMs: number
  }): Promise<boolean> {
    const { discordUserId, kind, username, owner, now, leaseMs } = input
    await this.db
      .insert(jumbleLibrarySync)
      .values({
        discordUserId,
        kind,
        canonicalUsername: username,
        refreshAfter: 0,
        leaseOwner: owner,
        leaseExpiresAt: now + leaseMs
      })
      .onConflictDoNothing()
    const claimed = await this.db
      .update(jumbleLibrarySync)
      .set({
        canonicalUsername: username,
        activeRefreshVersion: sql`CASE WHEN ${jumbleLibrarySync.canonicalUsername} = ${username} THEN ${jumbleLibrarySync.activeRefreshVersion} ELSE NULL END`,
        leaseOwner: owner,
        leaseExpiresAt: now + leaseMs
      })
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          or(
            eq(jumbleLibrarySync.leaseOwner, owner),
            isNull(jumbleLibrarySync.leaseOwner),
            lt(jumbleLibrarySync.leaseExpiresAt, now)
          )
        )
      )
      .returning({ owner: jumbleLibrarySync.leaseOwner })
    return claimed.length > 0
  }

  async replace(input: {
    discordUserId: string
    kind: JumbleKind
    username: string
    owner: string
    version: string
    candidates: readonly JumbleCandidate[]
    now: number
    refreshAfter: number
  }): Promise<boolean> {
    const { discordUserId, kind, username, owner, version, candidates, now, refreshAfter } = input
    const state = await this.db
      .select({
        activeRefreshVersion: jumbleLibrarySync.activeRefreshVersion,
        owner: jumbleLibrarySync.leaseOwner,
        canonicalUsername: jumbleLibrarySync.canonicalUsername
      })
      .from(jumbleLibrarySync)
      .where(
        and(eq(jumbleLibrarySync.discordUserId, discordUserId), eq(jumbleLibrarySync.kind, kind))
      )
      .limit(1)
    if (state[0]?.owner !== owner || state[0].canonicalUsername !== username) return false
    const values = candidates.map((candidate, rank) => {
      const identityKey = jumbleCandidateIdentityKey(candidate)
      return {
        discordUserId,
        kind,
        identityKey,
        candidate: JSON.stringify(candidate),
        rank,
        refreshVersion: version,
        syncedAt: now
      }
    })
    if (values.length > 0) {
      await this.db
        .insert(jumbleLibraryItems)
        .values(values)
        .onConflictDoUpdate({
          target: [
            jumbleLibraryItems.discordUserId,
            jumbleLibraryItems.kind,
            jumbleLibraryItems.refreshVersion,
            jumbleLibraryItems.identityKey
          ],
          set: {
            candidate: sql`excluded.candidate`,
            rank: sql`excluded.rank`,
            refreshVersion: version,
            syncedAt: now
          }
        })
    }
    const published = await this.db
      .update(jumbleLibrarySync)
      .set({
        refreshedAt: now,
        refreshAfter,
        activeRefreshVersion: version,
        failureCount: 0
      })
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.leaseOwner, owner)
        )
      )
      .returning({ version: jumbleLibrarySync.activeRefreshVersion })
    if (published.length === 0 || published[0]?.version !== version) {
      await this.db
        .delete(jumbleLibraryItems)
        .where(
          and(
            eq(jumbleLibraryItems.discordUserId, discordUserId),
            eq(jumbleLibraryItems.kind, kind),
            eq(jumbleLibraryItems.refreshVersion, version)
          )
        )
      return false
    }
    const retainedVersions = [version, state[0]?.activeRefreshVersion].filter(
      (value): value is string => value !== null
    )
    const stillOwnsPublishedGeneration = this.db
      .select({ one: sql`1` })
      .from(jumbleLibrarySync)
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.leaseOwner, owner),
          eq(jumbleLibrarySync.activeRefreshVersion, version)
        )
      )
    await this.db
      .delete(jumbleLibraryItems)
      .where(
        and(
          eq(jumbleLibraryItems.discordUserId, discordUserId),
          eq(jumbleLibraryItems.kind, kind),
          notInArray(jumbleLibraryItems.refreshVersion, retainedVersions),
          exists(stillOwnsPublishedGeneration)
        )
      )
    await this.db
      .update(jumbleLibrarySync)
      .set({ leaseOwner: null, leaseExpiresAt: null })
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.leaseOwner, owner),
          eq(jumbleLibrarySync.activeRefreshVersion, version)
        )
      )
    return true
  }

  async updateCandidate(
    discordUserId: string,
    kind: JumbleKind,
    canonicalUsername: string,
    candidate: JumbleCandidate
  ): Promise<void> {
    await this.db
      .insert(jumbleLibraryMetadata)
      .values({
        discordUserId,
        kind,
        canonicalUsername,
        identityKey: jumbleCandidateIdentityKey(candidate),
        candidate: JSON.stringify(candidate),
        updatedAt: Date.now()
      })
      .onConflictDoUpdate({
        target: [
          jumbleLibraryMetadata.discordUserId,
          jumbleLibraryMetadata.kind,
          jumbleLibraryMetadata.canonicalUsername,
          jumbleLibraryMetadata.identityKey
        ],
        set: { candidate: JSON.stringify(candidate), updatedAt: Date.now() }
      })
  }

  async fail(discordUserId: string, kind: JumbleKind, owner: string, now: number): Promise<void> {
    const rows = await this.db
      .select({ failures: jumbleLibrarySync.failureCount })
      .from(jumbleLibrarySync)
      .where(
        and(eq(jumbleLibrarySync.discordUserId, discordUserId), eq(jumbleLibrarySync.kind, kind))
      )
      .limit(1)
    await this.db
      .update(jumbleLibrarySync)
      .set({
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCount: (rows[0]?.failures ?? 0) + 1,
        refreshAfter: now + 60_000
      })
      .where(
        and(
          eq(jumbleLibrarySync.discordUserId, discordUserId),
          eq(jumbleLibrarySync.kind, kind),
          eq(jumbleLibrarySync.leaseOwner, owner)
        )
      )
  }
}

function parseCandidate(value: string, kind: JumbleKind): JumbleCandidate | undefined {
  let decoded: unknown
  try {
    decoded = JSON.parse(value) as unknown
  } catch {
    return undefined
  }
  const parsed = JumbleCandidateSchema.safeParse(decoded)
  return parsed.success && parsed.data.kind === kind ? parsed.data : undefined
}
