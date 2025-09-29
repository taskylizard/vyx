import { PrismaPg } from '@prisma/adapter-pg'
import { PersonalityStatus, PrismaClient } from './generated/client.js'

export function getDb(connectionString: string) {
  const pool = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter: pool })

  return prisma
}

export const prisma = getDb(process.env.DATABASE_URL!)

export * from './generated'
export * from './generated/client.js'
export { PersonalityStatus }
