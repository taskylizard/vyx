import { isNumber } from '@antfu/utils';
import { Logger } from '@control.systems/logger';
import {
  InfluxDB,
  Point,
  type QueryApi,
  type WriteApi
} from '@influxdata/influxdb-client';
import type {
  AnyInteractionChannel,
  ApplicationCommandTypes,
  CommandInteraction,
  Uncached
} from 'oceanic.js';
import { type Client, env } from '../client';

export class Analytics {
  public constructor(private client: Client) {
    this.writeApi = this.influx!.getWriteApi('tasker', 'vyx', 's');
    this.queryApi = this.influx!.getQueryApi('tasker');
  }

  public influx: InfluxDB = new InfluxDB({
    url: env.INFLUXDB_URL,
    token: env.INFLUXDB_ADMIN_TOKEN
  });

  private logger: Logger = new Logger(this.constructor.name);
  public writeApi!: WriteApi;
  public queryApi!: QueryApi;

  public async writeStats() {
    const users = new Point('Users')
      .floatField('discord', await this.client.getUsersCount())
      .floatField('revolt', await this.client.revolt.getUsersCount())
      .floatField('divolt', await this.client.divolt.getUsersCount());

    let discordPing = this.client.shards.map((shard) => shard.latency)[0];

    if (
      Number.isNaN(discordPing) ||
      !isNumber(discordPing) ||
      typeof discordPing === 'undefined' ||
      discordPing === Infinity
    )
      discordPing = 0;

    const ping = new Point('Ping')
      .floatField('discord', discordPing)
      .floatField('revolt', this.client.revolt.events.ping())
      .floatField('divolt', this.client.divolt.events.ping());

    try {
      this.writeApi.writePoints([users, ping]);
    } catch (error) {
      this.logger.error(error);
    }
  }

  public writeInteraction(
    interaction: CommandInteraction<
      AnyInteractionChannel | Uncached,
      ApplicationCommandTypes
    >
  ) {
    if (!interaction.isChatInputCommand()) return;

    const point = new Point('Commands')
      .stringField('guild', interaction.guild?.name)
      .stringField('guild_id', interaction.guildID)
      .stringField('user', interaction.user.username)
      .stringField('user_id', interaction.user.id)
      .stringField('channel_id', interaction.channelID)
      .tag('command', interaction.data.name)
      .timestamp(new Date(interaction.createdAt));

    try {
      this.writeApi.writePoint(point);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
