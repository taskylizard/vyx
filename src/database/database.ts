import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { jumbleSchema } from './schemas/jumble.ts'

export interface KanikouDatabaseOptions {
  url?: string
  authToken?: string
  client?: Client
  migrationsFolder?: string
}

const kanikouSchema = { ...jumbleSchema }

export interface KanikouDatabase {
  readonly client: Client
  readonly db: LibSQLDatabase<typeof kanikouSchema>
  initialize(): Promise<void>
  close(): void
}

const DEFAULT_DATABASE_URL = 'file:./data/kanikou.db'

/** Create Kanikou's libSQL client and apply pending Drizzle migrations. */
export function createKanikouDatabase(options: KanikouDatabaseOptions = {}): KanikouDatabase {
  const url = options.url ?? DEFAULT_DATABASE_URL
  const ownsClient = options.client === undefined
  if (ownsClient) ensureLocalDatabaseDirectory(url)
  const client = options.client ?? createClient({ url, authToken: options.authToken })
  const db = drizzle<typeof kanikouSchema>(client, { schema: kanikouSchema })
  const migrationsFolder = options.migrationsFolder ?? resolve('drizzle')
  let initialized: Promise<void> | undefined

  return {
    client,
    db,
    async initialize() {
      initialized ??= migrate(db, { migrationsFolder })
      await initialized
    },
    close() {
      if (ownsClient) client.close()
    }
  }
}

function ensureLocalDatabaseDirectory(url: string): void {
  if (!url.startsWith('file:')) return
  const path = url.slice('file:'.length)
  if (path === '' || path === ':memory:') return
  mkdirSync(dirname(resolve(path)), { recursive: true })
}

export { DEFAULT_DATABASE_URL }
