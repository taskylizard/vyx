import { integer, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * The small, intentionally boring schema behind Jumble. Music metadata is
 * copied into a session so a game remains answerable when Last.fm changes or
 * becomes unavailable later.
 */
export const jumbleProfiles = sqliteTable(
  'jumble_profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    discordUserId: text('discord_user_id').notNull(),
    lastfmUsername: text('lastfm_username').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull()
  },
  (table) => [uniqueIndex('jumble_profiles_discord_user_idx').on(table.discordUserId)]
)

export const jumbleSessions = sqliteTable(
  'jumble_sessions',
  {
    id: text('id').primaryKey(),
    starterUserId: text('starter_user_id').notNull(),
    guildId: text('guild_id'),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id'),
    kind: text('kind').notNull(),
    sourceUsername: text('source_username').notNull(),
    answer: text('answer').notNull(),
    artistName: text('artist_name'),
    albumName: text('album_name'),
    imageUrl: text('image_url'),
    metadata: text('metadata').notNull(),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }),
    outcome: text('outcome'),
    blurStage: integer('blur_stage').notNull().default(0),
    reshuffleCount: integer('reshuffle_count').notNull().default(0)
  },
  (table) => [
    index('jumble_sessions_channel_active_idx').on(table.channelId, table.endedAt),
    uniqueIndex('jumble_sessions_one_active_channel_idx')
      .on(table.channelId)
      .where(sql`${table.endedAt} IS NULL`),
    index('jumble_sessions_user_kind_idx').on(table.starterUserId, table.kind, table.startedAt)
  ]
)

export const jumbleAnswers = sqliteTable(
  'jumble_answers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => jumbleSessions.id, { onDelete: 'cascade' }),
    discordUserId: text('discord_user_id').notNull(),
    rawAnswer: text('raw_answer').notNull(),
    normalizedAnswer: text('normalized_answer').notNull(),
    correct: integer('correct', { mode: 'boolean' }).notNull(),
    answeredAt: integer('answered_at', { mode: 'number' }).notNull()
  },
  (table) => [index('jumble_answers_session_idx').on(table.sessionId, table.answeredAt)]
)

export const jumbleHints = sqliteTable(
  'jumble_hints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => jumbleSessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    shown: integer('shown', { mode: 'boolean' }).notNull().default(false),
    hintOrder: integer('hint_order')
  },
  (table) => [index('jumble_hints_session_idx').on(table.sessionId, table.hintOrder)]
)

/**
 * Compact, provider-agnostic metadata cache entries.  Raw provider responses
 * are deliberately not retained here: callers store only the small normalized
 * object needed to build a game.
 */
export const jumbleMetadataCache = sqliteTable(
  'jumble_metadata_cache',
  {
    cacheKey: text('cache_key').primaryKey(),
    payload: text('payload').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'number' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'number' }).notNull()
  },
  (table) => [index('jumble_metadata_cache_expiry_idx').on(table.expiresAt, table.fetchedAt)]
)

export const jumbleLibraryItems = sqliteTable(
  'jumble_library_items',
  {
    discordUserId: text('discord_user_id').notNull(),
    kind: text('kind').notNull(),
    identityKey: text('identity_key').notNull(),
    candidate: text('candidate').notNull(),
    rank: integer('rank').notNull(),
    refreshVersion: text('refresh_version').notNull(),
    syncedAt: integer('synced_at', { mode: 'number' }).notNull()
  },
  (table) => [
    uniqueIndex('jumble_library_items_generation_identity_idx').on(
      table.discordUserId,
      table.kind,
      table.refreshVersion,
      table.identityKey
    ),
    index('jumble_library_items_generation_rank_idx').on(
      table.discordUserId,
      table.kind,
      table.refreshVersion,
      table.rank
    )
  ]
)

export const jumbleLibrarySync = sqliteTable(
  'jumble_library_sync',
  {
    discordUserId: text('discord_user_id').notNull(),
    kind: text('kind').notNull(),
    canonicalUsername: text('canonical_username').notNull(),
    refreshedAt: integer('refreshed_at', { mode: 'number' }),
    refreshAfter: integer('refresh_after', { mode: 'number' }).notNull(),
    activeRefreshVersion: text('active_refresh_version'),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'number' }),
    failureCount: integer('failure_count').notNull().default(0)
  },
  (table) => [
    uniqueIndex('jumble_library_sync_user_kind_idx').on(table.discordUserId, table.kind),
    index('jumble_library_sync_refresh_idx').on(table.refreshAfter)
  ]
)

export const jumbleLibraryMetadata = sqliteTable(
  'jumble_library_metadata',
  {
    discordUserId: text('discord_user_id').notNull(),
    kind: text('kind').notNull(),
    canonicalUsername: text('canonical_username').notNull(),
    identityKey: text('identity_key').notNull(),
    candidate: text('candidate').notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull()
  },
  (table) => [
    uniqueIndex('jumble_library_metadata_identity_idx').on(
      table.discordUserId,
      table.kind,
      table.canonicalUsername,
      table.identityKey
    )
  ]
)

export const jumbleSchema = {
  jumbleProfiles,
  jumbleSessions,
  jumbleAnswers,
  jumbleHints,
  jumbleMetadataCache,
  jumbleLibraryItems,
  jumbleLibrarySync,
  jumbleLibraryMetadata
}

export type JumbleProfileRow = typeof jumbleProfiles.$inferSelect
export type JumbleSessionRow = typeof jumbleSessions.$inferSelect
export type JumbleAnswerRow = typeof jumbleAnswers.$inferSelect
export type JumbleHintRow = typeof jumbleHints.$inferSelect
export type JumbleMetadataCacheRow = typeof jumbleMetadataCache.$inferSelect
