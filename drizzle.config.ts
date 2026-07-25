import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './src/database/schemas/jumble.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.KANIKOU_DATABASE_URL ?? 'file:./data/kanikou.db',
    authToken: process.env.LIBSQL_AUTH_TOKEN
  }
})
