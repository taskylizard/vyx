import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { unique } from 'radashi'
import { match } from 'ts-pattern'
import {
  jumbleAnswers,
  jumbleHints,
  jumbleProfiles,
  jumbleSchema,
  jumbleSessions,
  type JumbleSessionRow
} from '../database/schemas/jumble.ts'
import { JumbleSessionMetadataSchema } from './schemas.ts'
import {
  isJumbleKind,
  type JumbleCandidate,
  type JumbleHint,
  type JumbleKind,
  type JumbleOutcome,
  type JumbleSession,
  type JumbleSessionMetadata,
  type JumbleStats
} from './types.ts'

export type JumbleRepositoryDatabase = LibSQLDatabase<typeof jumbleSchema>

export interface CreateJumbleSessionInput {
  id: string
  starterUserId: string
  guildId: string | null
  channelId: string
  kind: JumbleKind
  sourceUsername: string
  answer: string
  artistName: string | null
  albumName: string | null
  imageUrl: string | null
  metadata: JumbleSessionMetadata
  startedAt?: number
  blurStage?: number
}

export interface JumbleAnswerRecord {
  sessionId: string
  discordUserId: string
  rawAnswer: string
  normalizedAnswer: string
  correct: boolean
  answeredAt?: number
}

export class JumbleRepository {
  readonly db: JumbleRepositoryDatabase

  constructor(db: JumbleRepositoryDatabase) {
    this.db = db
  }

  async getProfile(discordUserId: string): Promise<string | null> {
    const rows = await this.db
      .select({ username: jumbleProfiles.lastfmUsername })
      .from(jumbleProfiles)
      .where(eq(jumbleProfiles.discordUserId, discordUserId))
      .limit(1)
    return rows[0]?.username ?? null
  }

  async setProfile(discordUserId: string, lastfmUsername: string): Promise<void> {
    const now = Date.now()
    await this.db
      .insert(jumbleProfiles)
      .values({
        discordUserId,
        lastfmUsername,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: jumbleProfiles.discordUserId,
        set: { lastfmUsername, updatedAt: now }
      })
  }

  async listProfiles(): Promise<readonly { discordUserId: string; username: string }[]> {
    return this.db
      .select({
        discordUserId: jumbleProfiles.discordUserId,
        username: jumbleProfiles.lastfmUsername
      })
      .from(jumbleProfiles)
      .orderBy(asc(jumbleProfiles.discordUserId))
  }

  async findActiveForChannel(channelId: string): Promise<JumbleSession | null> {
    const rows = await this.db
      .select()
      .from(jumbleSessions)
      .where(and(eq(jumbleSessions.channelId, channelId), isNull(jumbleSessions.endedAt)))
      .orderBy(desc(jumbleSessions.startedAt))
      .limit(1)
    return rows.length === 0 ? null : toSession(rows[0])
  }

  async listActive(): Promise<readonly JumbleSession[]> {
    const rows = await this.db
      .select()
      .from(jumbleSessions)
      .where(isNull(jumbleSessions.endedAt))
      .orderBy(asc(jumbleSessions.startedAt))
    return rows.map(toSession)
  }

  async listRecentForUser(
    discordUserId: string,
    kind: JumbleKind,
    limit = 100
  ): Promise<readonly JumbleSession[]> {
    const rows = await this.db
      .select()
      .from(jumbleSessions)
      .where(and(eq(jumbleSessions.starterUserId, discordUserId), eq(jumbleSessions.kind, kind)))
      .orderBy(desc(jumbleSessions.startedAt))
      .limit(limit)
    return rows.map(toSession)
  }

  async findSession(id: string): Promise<JumbleSession | null> {
    const rows = await this.db
      .select()
      .from(jumbleSessions)
      .where(eq(jumbleSessions.id, id))
      .limit(1)
    return rows.length === 0 ? null : toSession(rows[0])
  }

  async createSession(input: CreateJumbleSessionInput): Promise<JumbleSession> {
    const row = {
      id: input.id,
      starterUserId: input.starterUserId,
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: null,
      kind: input.kind,
      sourceUsername: input.sourceUsername,
      answer: input.answer,
      artistName: input.artistName,
      albumName: input.albumName,
      imageUrl: input.imageUrl,
      metadata: JSON.stringify(input.metadata),
      startedAt: input.startedAt ?? Date.now(),
      endedAt: null,
      outcome: null,
      blurStage: input.blurStage ?? 0,
      reshuffleCount: 0
    } satisfies typeof jumbleSessions.$inferInsert
    await this.db.insert(jumbleSessions).values(row)
    const session = await this.findSession(input.id)
    if (session === null) throw new Error('Jumble session disappeared immediately after creation.')
    return session
  }

  async setMessageId(sessionId: string, messageId: string): Promise<JumbleSession | null> {
    await this.db.update(jumbleSessions).set({ messageId }).where(eq(jumbleSessions.id, sessionId))
    return this.findSession(sessionId)
  }

  async setBlurStage(sessionId: string, blurStage: number): Promise<JumbleSession | null> {
    await this.db
      .update(jumbleSessions)
      .set({ blurStage })
      .where(and(eq(jumbleSessions.id, sessionId), isNull(jumbleSessions.endedAt)))
    return this.findSession(sessionId)
  }

  async updateMetadata(
    sessionId: string,
    metadata: JumbleSessionMetadata
  ): Promise<JumbleSession | null> {
    await this.db
      .update(jumbleSessions)
      .set({ metadata: JSON.stringify(metadata) })
      .where(and(eq(jumbleSessions.id, sessionId), isNull(jumbleSessions.endedAt)))
    return this.findSession(sessionId)
  }

  async incrementReshuffle(sessionId: string): Promise<JumbleSession | null> {
    const session = await this.findSession(sessionId)
    if (session === null || session.endedAt !== null) return session
    await this.db
      .update(jumbleSessions)
      .set({ reshuffleCount: session.reshuffleCount + 1 })
      .where(and(eq(jumbleSessions.id, sessionId), isNull(jumbleSessions.endedAt)))
    return this.findSession(sessionId)
  }

  async addHints(
    sessionId: string,
    hints: readonly JumbleHint[],
    shownCount: number
  ): Promise<void> {
    if (hints.length === 0) return
    await this.db.insert(jumbleHints).values(
      hints.map((hint, index) => ({
        sessionId,
        kind: hint.kind,
        content: hint.content,
        shown: index < shownCount,
        hintOrder: index
      }))
    )
  }

  async listHints(
    sessionId: string
  ): Promise<Array<JumbleHint & { shown: boolean; order: number }>> {
    const rows = await this.db
      .select()
      .from(jumbleHints)
      .where(eq(jumbleHints.sessionId, sessionId))
      .orderBy(asc(jumbleHints.hintOrder), asc(jumbleHints.id))
    return rows.map((row) => ({
      kind: row.kind,
      content: row.content,
      shown: row.shown,
      order: row.hintOrder ?? row.id
    }))
  }

  async revealNextHint(sessionId: string): Promise<JumbleHint | null> {
    const rows = await this.db
      .select()
      .from(jumbleHints)
      .where(and(eq(jumbleHints.sessionId, sessionId), eq(jumbleHints.shown, false)))
      .orderBy(asc(jumbleHints.hintOrder), asc(jumbleHints.id))
      .limit(1)
    const row = rows[0]
    if (rows.length === 0) return null
    await this.db.update(jumbleHints).set({ shown: true }).where(eq(jumbleHints.id, row.id))
    return { kind: row.kind, content: row.content }
  }

  async recordAnswer(record: JumbleAnswerRecord): Promise<void> {
    await this.db.insert(jumbleAnswers).values({
      sessionId: record.sessionId,
      discordUserId: record.discordUserId,
      rawAnswer: record.rawAnswer,
      normalizedAnswer: record.normalizedAnswer,
      correct: record.correct,
      answeredAt: record.answeredAt ?? Date.now()
    })
  }

  async endSession(
    sessionId: string,
    outcome: JumbleOutcome,
    endedAt = Date.now()
  ): Promise<JumbleSession | null> {
    await this.db
      .update(jumbleSessions)
      .set({ endedAt, outcome })
      .where(and(eq(jumbleSessions.id, sessionId), isNull(jumbleSessions.endedAt)))
    return this.findSession(sessionId)
  }

  async recentAnswersForSession(
    sessionId: string
  ): Promise<Array<{ userId: string; correct: boolean }>> {
    return this.db
      .select({ userId: jumbleAnswers.discordUserId, correct: jumbleAnswers.correct })
      .from(jumbleAnswers)
      .where(eq(jumbleAnswers.sessionId, sessionId))
      .orderBy(asc(jumbleAnswers.answeredAt))
  }

  async winningUserId(sessionId: string): Promise<string | null> {
    const rows = await this.db
      .select({ userId: jumbleAnswers.discordUserId })
      .from(jumbleAnswers)
      .where(and(eq(jumbleAnswers.sessionId, sessionId), eq(jumbleAnswers.correct, true)))
      .orderBy(asc(jumbleAnswers.answeredAt), asc(jumbleAnswers.id))
      .limit(1)
    return rows[0]?.userId ?? null
  }

  async statsForUser(discordUserId: string, kind?: JumbleKind): Promise<JumbleStats> {
    const startedSessions = await this.db
      .select()
      .from(jumbleSessions)
      .where(
        kind === undefined
          ? eq(jumbleSessions.starterUserId, discordUserId)
          : and(eq(jumbleSessions.starterUserId, discordUserId), eq(jumbleSessions.kind, kind))
      )
      .orderBy(asc(jumbleSessions.startedAt))
    const allAnswers = await this.db
      .select()
      .from(jumbleAnswers)
      .where(eq(jumbleAnswers.discordUserId, discordUserId))
    const answeredIds = unique(allAnswers.map((answer) => answer.sessionId))
    const answeredSessions =
      answeredIds.length === 0
        ? []
        : await this.db
            .select()
            .from(jumbleSessions)
            .where(
              kind === undefined
                ? inArray(jumbleSessions.id, answeredIds)
                : and(inArray(jumbleSessions.id, answeredIds), eq(jumbleSessions.kind, kind))
            )
    const sessionMap = new Map(
      [...startedSessions, ...answeredSessions].map((session) => [session.id, session])
    )
    const sessions = [...sessionMap.values()].toSorted(
      (first, second) => first.startedAt - second.startedAt
    )
    const answers = allAnswers.filter((answer) => sessionMap.has(answer.sessionId))
    const correctSessionIds = new Set(
      answers.filter((answer) => answer.correct).map((answer) => answer.sessionId)
    )
    const durations = answers.flatMap((answer) => {
      if (!answer.correct) return []
      const session = sessionMap.get(answer.sessionId)
      return session === undefined ? [] : [(answer.answeredAt - session.startedAt) / 1000]
    })
    const hints = await Promise.all(sessions.map((session) => this.listHints(session.id)))
    return {
      played: sessions.length,
      won: correctSessionIds.size,
      gaveUp: sessions.filter(
        (session) => session.starterUserId === discordUserId && session.outcome === 'gave_up'
      ).length,
      expired: sessions.filter((session) => session.outcome === 'expired').length,
      guesses: answers.length,
      correctGuesses: answers.filter((answer) => answer.correct).length,
      averageSeconds: average(durations),
      averageHints: average(
        hints.map((sessionHints) => sessionHints.filter((hint) => hint.shown).length)
      ),
      averageReshuffles: average(sessions.map((session) => session.reshuffleCount))
    }
  }
}

function toSession(row: JumbleSessionRow): JumbleSession {
  if (!isJumbleKind(row.kind)) throw new Error(`Unknown Jumble kind in database: ${row.kind}`)
  return {
    id: row.id,
    starterUserId: row.starterUserId,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    kind: row.kind,
    sourceUsername: row.sourceUsername,
    answer: row.answer,
    artistName: row.artistName,
    albumName: row.albumName,
    imageUrl: row.imageUrl,
    metadata: parseMetadata(row.metadata, row, row.kind),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    outcome: match(row.outcome)
      .with('won', 'gave_up', 'expired', 'cancelled', (outcome) => outcome)
      .otherwise(() => null),
    blurStage: row.blurStage,
    reshuffleCount: row.reshuffleCount
  }
}

function parseMetadata(
  value: string,
  row: JumbleSessionRow,
  kind: JumbleKind
): JumbleSessionMetadata {
  try {
    const metadata: unknown = JSON.parse(value)
    const parsed = JumbleSessionMetadataSchema.safeParse(metadata)
    if (parsed.success) return parsed.data
  } catch {
    // tasky: bad metadata falls back to row fields instead of bricking the game
  }
  const candidate = match(kind)
    .returnType<JumbleCandidate>()
    .with('artist', () => ({
      kind: 'artist',
      answer: row.answer,
      imageUrl: row.imageUrl ?? undefined
    }))
    .with('album', () => ({
      kind: 'album',
      answer: row.answer,
      artistName: row.artistName ?? undefined,
      albumName: row.albumName ?? undefined,
      imageUrl: row.imageUrl ?? undefined
    }))
    .with('track', () => ({
      kind: 'track',
      answer: row.answer,
      artistName: row.artistName ?? undefined,
      albumName: row.albumName ?? undefined,
      imageUrl: row.imageUrl ?? undefined
    }))
    .exhaustive()

  return {
    candidate,
    hints: []
  }
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}
