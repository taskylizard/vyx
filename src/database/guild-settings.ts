import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { ApplicationCommandKey } from 'rosepack'
import { match, P } from 'ts-pattern'
import { guildSettings } from './schemas/guild-settings.ts'
import type { KanikouSchema } from './database.ts'

const MAX_MUTATION_ATTEMPTS = 8

export interface GuildModuleStateScope {
  applicationID: string
  guildID: string
}

export interface GuildModuleMutation extends GuildModuleStateScope {
  enabled: boolean
  module: string
}

export interface GuildModuleMutationResult {
  changed: boolean
  modules: readonly string[]
}

/**
 * Stores Rosepack's guild-module selection and command ownership metadata.
 *
 * Module changes use a compare-and-swap update. This keeps read/modify/write
 * operations safe when more than one bot process is connected to the same
 * SQLite/libSQL database, without holding a long-lived in-memory lock.
 */
export class GuildSettingsStore {
  private readonly db: LibSQLDatabase<KanikouSchema>

  constructor(db: LibSQLDatabase<KanikouSchema>) {
    this.db = db
  }

  async read({ applicationID, guildID }: GuildModuleStateScope): Promise<readonly string[]> {
    const row = await this.find(applicationID, guildID)
    return parseStringArray(row?.enabledModules)
  }

  async isEnabled({
    applicationID,
    guildID,
    module
  }: GuildModuleStateScope & { module: string }): Promise<boolean> {
    return (await this.read({ applicationID, guildID })).includes(module)
  }

  async mutate({
    applicationID,
    guildID,
    enabled,
    module
  }: GuildModuleMutation): Promise<GuildModuleMutationResult> {
    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
      const row = await this.find(applicationID, guildID)
      const rawModules = row?.enabledModules ?? '[]'
      const current = parseStringArray(rawModules)
      const currentlyEnabled = current.includes(module)
      if (currentlyEnabled === enabled) {
        return { changed: false, modules: current }
      }

      const next = match(enabled)
        .with(true, () => [...current, module])
        .otherwise(() => current.filter((value) => value !== module))
      const encoded = JSON.stringify(next)

      if (row === undefined) {
        await this.db
          .insert(guildSettings)
          .values({
            applicationId: applicationID,
            guildId: guildID,
            enabledModules: '[]',
            ownedCommandKeys: '[]',
            updatedAt: Date.now()
          })
          .onConflictDoNothing()
          .run()
        continue
      }

      const result = await this.db
        .update(guildSettings)
        .set({ enabledModules: encoded, updatedAt: Date.now() })
        .where(
          and(
            eq(guildSettings.applicationId, applicationID),
            eq(guildSettings.guildId, guildID),
            eq(guildSettings.enabledModules, rawModules)
          )
        )
        .run()
      if (result.rowsAffected === 1) {
        return { changed: true, modules: Object.freeze(next) }
      }
    }

    throw new Error('Guild module state changed too frequently; please try again.')
  }

  async readOwnedCommandKeys({
    applicationID,
    guildID
  }: GuildModuleStateScope): Promise<readonly ApplicationCommandKey[]> {
    const row = await this.find(applicationID, guildID)
    return parseCommandKeys(row?.ownedCommandKeys)
  }

  async writeOwnedCommandKeys({
    applicationID,
    guildID,
    keys
  }: GuildModuleStateScope & { keys: readonly ApplicationCommandKey[] }): Promise<void> {
    const ownedCommandKeys = JSON.stringify([...new Set(keys)])
    await this.db
      .insert(guildSettings)
      .values({
        applicationId: applicationID,
        guildId: guildID,
        enabledModules: '[]',
        ownedCommandKeys,
        updatedAt: Date.now()
      })
      .onConflictDoUpdate({
        target: [guildSettings.applicationId, guildSettings.guildId],
        set: { ownedCommandKeys, updatedAt: Date.now() }
      })
      .run()
  }

  private async find(applicationID: string, guildID: string) {
    const rows = await this.db
      .select({
        enabledModules: guildSettings.enabledModules,
        ownedCommandKeys: guildSettings.ownedCommandKeys
      })
      .from(guildSettings)
      .where(
        and(eq(guildSettings.applicationId, applicationID), eq(guildSettings.guildId, guildID))
      )
      .limit(1)
    return rows[0]
  }
}

function parseStringArray(value: string | null | undefined): readonly string[] {
  return match(value)
    .with(P.nullish, () => [])
    .otherwise((raw) => {
      try {
        const parsed: unknown = JSON.parse(raw)
        return match(parsed)
          .with(P.array(P.string), (strings) => Object.freeze([...new Set(strings)]))
          .otherwise(() => [])
      } catch {
        return []
      }
    })
}

function parseCommandKeys(value: string | null | undefined): readonly ApplicationCommandKey[] {
  return Object.freeze(parseStringArray(value).filter(isApplicationCommandKey))
}

function isApplicationCommandKey(value: string): value is ApplicationCommandKey {
  return /^\d+:.+$/u.test(value)
}
