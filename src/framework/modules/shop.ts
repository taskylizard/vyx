import type { Prisma, PrismaClient } from '@prisma/client';
import type { DefaultArgs } from '@prisma/client/runtime/library';

export interface ShopItemConstructor {
  guildId: bigint;
  name: string;
  description: string;
  price: number;
  role?: bigint;
}

export class ShopModule {
  table: Prisma.ShopItemDelegate<DefaultArgs>;

  constructor(private client: PrismaClient) {
    this.client = client;
    this.table = this.client.shopItem;
  }

  async list(guild: string) {
    const query = await this.table.findMany({
      where: { guildId: BigInt(guild) },
      orderBy: { itemId: 'asc' }
    });

    return query;
  }

  async get(guild: string, name: string) {
    const item = await this.table.findFirst({
      where: { guildId: BigInt(guild), name }
    });

    return item;
  }

  async add(item: ShopItemConstructor) {
    const [fetchedId] = await this.table.findMany({
      where: { guildId: BigInt(item.guildId) },
      orderBy: { itemId: 'desc' },
      take: 1
    });

    const previousId = fetchedId?.itemId ?? 0;

    const query = await this.table.create({
      data: {
        ...item,
        itemId: previousId + 1
      }
    });

    return query;
  }

  async delete(guild: string, name: string) {
    await this.table.deleteMany({
      where: {
        guildId: BigInt(guild),
        name
      }
    });
  }
}
