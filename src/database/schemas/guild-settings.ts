import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Persistent, per-application settings for one Discord guild. */
export const guildSettings = sqliteTable(
  'guild_settings',
  {
    applicationId: text('application_id').notNull(),
    guildId: text('guild_id').notNull(),
    /** JSON array of enabled Rosepack module IDs. */
    enabledModules: text('enabled_modules').notNull().default('[]'),
    /** JSON array of Rosepack-owned application-command keys. */
    ownedCommandKeys: text('owned_command_keys').notNull().default('[]'),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(0)
  },
  (table) => [primaryKey({ columns: [table.applicationId, table.guildId] })]
)

export const guildSettingsSchema = { guildSettings }

export type GuildSettingsRow = typeof guildSettings.$inferSelect
