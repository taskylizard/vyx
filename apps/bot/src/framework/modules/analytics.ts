import { isNumber } from '@antfu/utils'
import {
  InfluxDB,
  Point,
  type QueryApi,
  type WriteApi
} from '@influxdata/influxdb-client'
import type {
  AnyInteractionChannel,
  ApplicationCommandTypes,
  CommandInteraction,
  Uncached
} from 'oceanic.js'
import { Logger } from 'tracix'
import type { Client } from '../client'

export class AnalyticsModule {
  private logger: Logger = new Logger(this.constructor.name)
  public influx: InfluxDB
  public writeApi: WriteApi
  public queryApi: QueryApi

  public constructor(private client: Client) {
    this.influx = new InfluxDB({
      url: client.env.INFLUXDB_URL,
      token: client.env.INFLUXDB_ADMIN_TOKEN
    })
    this.writeApi = this.influx.getWriteApi('tasker', 'vyx', 's')
    this.queryApi = this.influx.getQueryApi('tasker')
  }

  public async writeStats() {
    const users = new Point('Users').floatField(
      'discord',
      await this.client.getUsersCount()
    )

    let discordPing = this.client.shards.map((shard) => shard.latency)[0] ?? 0

    if (
      Number.isNaN(discordPing) ||
      !isNumber(discordPing) ||
      typeof discordPing === 'undefined' ||
      discordPing === Number.POSITIVE_INFINITY
    )
      discordPing = 0

    const ping = new Point('Ping').floatField('discord', discordPing)

    const points = [users, ping]

    // Write guild member counts
    for (const guild of this.client.guilds.values()) {
      try {
        const memberCount =
          guild.memberCount ??
          (
            await guild.fetchMembers({
              limit: Number.POSITIVE_INFINITY
            })
          ).length

        const guildPoint = new Point(guild.id)
          .stringField('name', guild.name)
          .stringField('id', guild.id)
          .floatField('member_count', memberCount)
          .timestamp(new Date())
        points.push(guildPoint)
      } catch (error) {
        this.logger.error(
          `Failed to fetch members for guild ${guild.name}:`,
          error
        )
      }
    }

    try {
      this.writeApi.writePoints(points)
    } catch (error) {
      this.logger.error(error)
    }
  }

  public async writeInteraction(
    interaction: CommandInteraction<
      AnyInteractionChannel | Uncached,
      ApplicationCommandTypes
    >
  ) {
    if (!interaction.isChatInputCommand()) return

    const guildName = interaction.guild
      ? interaction.guild.name
      : interaction.guildID
        ? (await this.client.rest.guilds.get(interaction.guildID)).name
        : 'none'

    const guildId = interaction.guildID ?? 'none'

    const point = new Point('Commands')
      .stringField('guild', guildName)
      .stringField('guild_id', guildId)
      .stringField('user', interaction.user.username)
      .stringField('user_id', interaction.user.id)
      .stringField('channel_id', interaction.channelID)
      .tag('command', interaction.data.name)
      .timestamp(new Date(interaction.createdAt))

    try {
      this.writeApi.writePoint(point)
    } catch (error) {
      this.logger.error(error)
    }
  }
}
