import type { EconomyProfile, Prisma, PrismaClient } from '@prisma/client'
import type { DefaultArgs } from '@prisma/client/runtime/library'
import type { User } from 'oceanic.js'

export class EconomyModule {
  client: PrismaClient
  config: Prisma.ConfigDelegate<DefaultArgs>
  table: Prisma.EconomyProfileDelegate<DefaultArgs>

  constructor(client: PrismaClient) {
    this.client = client
    this.config = this.client.config
    this.table = this.client.economyProfile
  }

  async get(guild: string, user: User): Promise<EconomyProfile | undefined> {
    const query = await this.table.upsert({
      where: {
        guildId_userId: {
          guildId: BigInt(guild),
          userId: BigInt(user.id)
        }
      },
      update: {},
      create: {
        guildId: BigInt(guild),
        userId: BigInt(user.id),
        walletBal: 0,
        bankBal: 0
      }
    })

    return query
  }

  async add(guild: string, user: User, amount: number) {
    const query = await this.table.upsert({
      where: {
        guildId_userId: {
          guildId: BigInt(guild),
          userId: BigInt(user.id)
        }
      },
      update: {
        walletBal: { increment: amount }
      },
      create: {
        guildId: BigInt(guild),
        userId: BigInt(user.id),
        walletBal: amount,
        bankBal: 0
      }
    })

    return query
  }

  async subtract(guild: string, user: User, amount: number) {
    const query = await this.table.upsert({
      where: {
        guildId_userId: {
          guildId: BigInt(guild),
          userId: BigInt(user.id)
        }
      },
      update: {
        walletBal: { decrement: amount }
      },
      create: {
        guildId: BigInt(guild),
        userId: BigInt(user.id),
        walletBal: 0 - amount,
        bankBal: 0
      }
    })

    return query
  }

  async deposit(guild: string, user: User, amount: number) {
    const query = await this.table.upsert({
      where: {
        guildId_userId: {
          guildId: BigInt(guild),
          userId: BigInt(user.id)
        }
      },
      update: {
        walletBal: { decrement: amount },
        bankBal: { increment: amount }
      },
      create: {
        guildId: BigInt(guild),
        userId: BigInt(user.id),
        walletBal: 0 - amount,
        bankBal: 0 + amount
      }
    })

    return query
  }

  async withdraw(guild: string, user: User, amount: number) {
    const query = await this.table.upsert({
      where: {
        guildId_userId: {
          guildId: BigInt(guild),
          userId: BigInt(user.id)
        }
      },
      update: {
        walletBal: { increment: amount },
        bankBal: { decrement: amount }
      },
      create: {
        guildId: BigInt(guild),
        userId: BigInt(user.id),
        walletBal: 0 + amount,
        bankBal: 0 - amount
      }
    })

    return query
  }

  async getCurrency(guild: string) {
    const config = await this.config.findUnique({
      where: { guildId: BigInt(guild) },
      select: { currency: true }
    })

    return config?.currency || '🍣'
  }

  async getAll(guild: string) {
    return await this.table.findMany({
      where: { guildId: BigInt(guild) }
    })
  }
}
