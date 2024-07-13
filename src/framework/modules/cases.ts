import type { Prisma } from '@prisma/client';
import type { DefaultArgs } from '@prisma/client/runtime/library';
import { ChannelTypes, type User } from 'oceanic.js';
import { type Client, Embed } from '#framework';

export class CasesModule {
  table: Prisma.CaseDelegate<DefaultArgs>;

  constructor(private client: Client) {
    this.client = client;
    this.table = this.client.prisma.case;
  }

  async create(
    guildId: string,
    moderatedUser: User,
    caseCreator: User,
    type: string,
    reason: string
  ) {
    const [fetchedId] = await this.table.findMany({
      where: { guildId: BigInt(guildId) },
      orderBy: { caseId: 'desc' },
      take: 1
    });

    const caseId = fetchedId?.caseId ?? 0;

    const query = await this.table.create({
      data: {
        caseId: caseId + 1,
        guildId: BigInt(guildId),
        caseCreator: BigInt(caseCreator.id),
        moderatedUser: BigInt(moderatedUser.id),
        type,
        reason,
        createdAt: BigInt(Date.now())
      }
    });

    return query;
  }

  async getOne(guildId: string, caseId: number) {
    return await this.table.findUnique({
      where: {
        caseId_guildId: {
          caseId,
          guildId: BigInt(guildId)
        }
      }
    });
  }

  async getMany(guildId: string, user: User) {
    return await this.table.findMany({
      where: {
        guildId: BigInt(guildId),
        moderatedUser: BigInt(user.id)
      }
    });
  }

  async log(guildId: string, caseObj: Prisma.CaseCreateInput) {
    const config = await this.client.prisma.config.findUnique({
      where: {
        guildId: BigInt(guildId)
      }
    });

    if (!config) return;

    const { logsChannel } = config;

    if (logsChannel) {
      const creator = this.client.users.get(caseObj.caseCreator.toString());
      const guildObj = this.client.guilds.get(guildId)!;
      const member = guildObj.members.get(caseObj.moderatedUser.toString());

      const embed = new Embed()
        .setTitle('New Case!')
        .setThumbnail(member!.avatarURL())
        .addFields([
          {
            name: 'Case Type',
            value: caseObj.type.toUpperCase() as
              | 'BAN'
              | 'KICK'
              | 'WARN'
              | 'TIMEOUT'
          },
          { name: 'Moderator', value: creator!.tag },
          { name: 'Moderated User', value: member!.user.tag },
          { name: 'Reason', value: caseObj.reason },
          { name: 'Case ID', value: `#${caseObj.caseId}` }
        ]);

      const channel = guildObj.channels.get(logsChannel.toString());

      if (channel!.type !== ChannelTypes.GUILD_TEXT) {
        return;
      }

      await channel?.createMessage({ embeds: [embed] });
    }
  }

  async getGuild(id: string) {
    return await this.client.prisma.case.findMany({
      where: {
        guildId: BigInt(id)
      }
    });
  }

  async editReason(guildId: string, caseId: number, reason: string) {
    return await this.table.update({
      where: {
        caseId_guildId: {
          caseId,
          guildId: BigInt(guildId)
        }
      },
      data: {
        reason
      }
    });
  }

  async delete(guildId: string, caseId: number) {
    const caseData = await this.getOne(guildId, caseId)!;
    const guild = this.client.guilds.get(guildId);
    const user = this.client.users.get(caseData!.moderatedUser.toString());

    switch (caseData!.type) {
      case 'ban':
        await guild?.removeBan(user?.id!);
        break;
      case 'timeout':
        // biome-ignore lint/correctness/noSwitchDeclarations: no idea lol
        const member = await guild?.getMember(user?.id!);
        await member!.edit({ communicationDisabledUntil: null });
        break;
    }

    return this.table.delete({
      where: {
        caseId_guildId: {
          caseId,
          guildId: BigInt(guildId)
        }
      }
    });
  }
}
