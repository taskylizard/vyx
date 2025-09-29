import { isNumber } from '@antfu/utils'
import type {
  AnyInteractionChannel,
  ApplicationCommandTypes,
  CommandInteraction,
  Uncached
} from 'oceanic.js'
import type { Client } from '../client'
import { logger } from '../utils/logger'

export class AnalyticsModule {
  private analyticsLogger = logger.withTag('Analytics')

  public constructor(private client: Client) {
    if (client.env.NODE_ENV !== 'production') {
      this.analyticsLogger.warn(
        'Analytics are disabled in non-production environments.'
      )
    }
  }

  public async writeStats() {
    if (this.client.env.NODE_ENV !== 'production') return

    try {
      const discordPing = this.getDiscordPing()
      const userCount = await this.client.getUsersCount()

      // Log system metrics
      this.analyticsLogger.info('System metrics collected', {
        event_type: 'system_metrics',
        discord_users: userCount,
        discord_ping: discordPing,
        guild_count: this.client.guilds.size,
        memory_usage: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date()
      })

      // Log individual guild metrics
      for (const guild of this.client.guilds.values()) {
        try {
          const memberCount = guild.memberCount ??
            (await guild.fetchMembers({ limit: Number.POSITIVE_INFINITY }))
              .length

          this.analyticsLogger.info('Guild metrics collected', {
            event_type: 'guild_metrics',
            guild_id: guild.id,
            guild_name: guild.name,
            member_count: memberCount,
            timestamp: new Date()
          })
        } catch (error) {
          this.analyticsLogger.error('Failed to fetch members for guild', {
            guild_id: guild.id,
            guild_name: guild.name,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    } catch (error) {
      this.analyticsLogger.error('Failed to collect system metrics', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  public async writeInteraction(
    interaction: CommandInteraction<
      AnyInteractionChannel | Uncached,
      ApplicationCommandTypes
    >
  ) {
    if (this.client.env.NODE_ENV !== 'production') return

    if (!interaction.isChatInputCommand()) return

    try {
      const guildName = interaction.guild
        ? interaction.guild.name
        : interaction.guildID
        ? (await this.client.rest.guilds.get(interaction.guildID)).name
        : 'DM'

      const commandPath = this.getCommandPath(interaction)

      this.analyticsLogger.info('Command interaction executed', {
        event_type: 'discord_command',
        guild: {
          id: interaction.guildID || 'dm',
          name: guildName
        },
        user: {
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator
        },
        command: {
          name: interaction.data.name,
          path: commandPath,
          id: interaction.data.id
        },
        channel_id: interaction.channelID,
        interaction_id: interaction.id,
        created_at: new Date(interaction.createdAt),
        timestamp: new Date()
      })
    } catch (error) {
      this.analyticsLogger.error('Failed to log interaction', {
        interaction_id: interaction.id,
        command_name: interaction.data.name,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private getDiscordPing(): number {
    let discordPing = this.client.shards.map((shard) => shard.latency)[0] ?? 0

    if (
      Number.isNaN(discordPing) ||
      !isNumber(discordPing) ||
      typeof discordPing === 'undefined' ||
      discordPing === Number.POSITIVE_INFINITY
    ) {
      discordPing = 0
    }

    return discordPing
  }

  private getCommandPath(interaction: CommandInteraction): string {
    if (!interaction.isChatInputCommand()) return interaction.data.name

    const subcommandPath = interaction.data.options.getSubCommand(false)

    if (subcommandPath && subcommandPath.length > 0) {
      return `${interaction.data.name} ${subcommandPath.join(' ')}`
    }

    return interaction.data.name
  }

  // Compatibility methods for graceful shutdown
  public async flush() {
    // Flush any pending logs
    this.analyticsLogger.debug('Analytics module flush requested')
  }

  public async close() {
    this.analyticsLogger.debug('Analytics module closing')
  }
}
