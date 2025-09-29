import type { Client, Context } from '#framework'
import { colors, Embed } from '#framework'
import type { Message, TextChannel } from 'oceanic.js'

interface ModerationLogOptions {
  action: 'BAN' | 'UNBAN' | 'KICK' | 'TIMEOUT'
  moderator: string
  moderatorId: string
  target: string
  targetId: string
  reason: string
  duration?: string
  additional?: Record<string, string>
}

interface MessageLogOptions {
  action: 'MESSAGE_EDIT' | 'MESSAGE_DELETE'
  message: Message
  oldContent?: string
  newContent?: string
}

export async function logModerationAction(
  ctx: Context,
  options: ModerationLogOptions
): Promise<void> {
  try {
    // Get server configuration
    const config = await ctx.client.prisma.config.findUnique({
      where: {
        guildId: BigInt(ctx.interaction.guildID!)
      }
    })

    if (
      !config?.logsEnabled ||
      !config?.logModerationActions ||
      !config?.logsChannel
    ) {
      return // Logging not configured or disabled
    }

    // Get the logs channel
    const logsChannel = ctx.guild?.channels.get(
      config.logsChannel.toString()
    ) as TextChannel | undefined

    if (!logsChannel) {
      console.warn(`Moderation logs channel not found: ${config.logsChannel}`)
      return
    }

    // Create case entry in database
    const lastCase = await ctx.client.prisma.case.findFirst({
      where: {
        guildId: BigInt(ctx.interaction.guildID!)
      },
      orderBy: {
        caseId: 'desc'
      }
    })

    const newCaseId = (lastCase?.caseId ?? 0) + 1

    await ctx.client.prisma.case.create({
      data: {
        caseId: newCaseId,
        guildId: BigInt(ctx.interaction.guildID!),
        caseCreator: BigInt(options.moderatorId),
        moderatedUser: BigInt(options.targetId),
        type: options.action,
        reason: options.reason,
        createdAt: BigInt(Date.now())
      }
    })

    // Create log embed
    const embed = new Embed()
      .setTitle(`${getActionEmoji(options.action)} ${options.action}`)
      .setColor(getActionColor(options.action))
      .addField('Target', `${options.target} (${options.targetId})`, true)
      .addField(
        'Moderator',
        `${options.moderator} (${options.moderatorId})`,
        true
      )
      .addField('Reason', options.reason, false)
      .addField('Case ID', `#${newCaseId}`, true)
      .setTimestamp()

    if (options.duration) {
      embed.addField('Duration', options.duration, true)
    }

    if (options.additional) {
      for (const [key, value] of Object.entries(options.additional)) {
        embed.addField(key, value, true)
      }
    }

    // Send to logs channel
    await logsChannel.createMessage({
      embeds: [embed]
    })
  } catch (error) {
    console.error('Failed to log moderation action:', error)
  }
}

export async function logMessageAction(
  client: Client,
  guildId: string,
  options: MessageLogOptions
): Promise<void> {
  try {
    // Get server configuration
    const config = await client.prisma.config.findUnique({
      where: {
        guildId: BigInt(guildId)
      }
    })

    if (!config?.logsEnabled || !config?.logsChannel) {
      return // Logging not configured
    }

    // Check if specific message logging is enabled
    if (options.action === 'MESSAGE_EDIT' && !config.logMessageEdits) {
      return
    }
    if (options.action === 'MESSAGE_DELETE' && !config.logMessageDeletes) {
      return
    }

    // Don't log bot messages
    if (options.message.author?.bot) {
      return
    }

    // Get the logs channel
    const guild = client.guilds.get(guildId)
    const logsChannel = guild?.channels.get(config.logsChannel.toString()) as
      | TextChannel
      | undefined

    if (!logsChannel) {
      console.warn(`Message logs channel not found: ${config.logsChannel}`)
      return
    }

    // Create log embed
    const embed = new Embed()
      .setTitle(
        `${getActionEmoji(options.action)} ${options.action.replace('_', ' ')}`
      )
      .setColor(getActionColor(options.action))
      .addField(
        'Author',
        `${options.message.author?.username} (${options.message.author?.id})`,
        true
      )
      .addField('Channel', `<#${options.message.channelID}>`, true)
      .addField('Message ID', options.message.id, true)
      .setTimestamp()

    if (options.action === 'MESSAGE_EDIT') {
      if (options.oldContent) {
        embed.addField(
          'Old Content',
          options.oldContent.length > 1024
            ? `${options.oldContent.substring(0, 1021)}...`
            : options.oldContent,
          false
        )
      }
      if (options.newContent) {
        embed.addField(
          'New Content',
          options.newContent.length > 1024
            ? `${options.newContent.substring(0, 1021)}...`
            : options.newContent,
          false
        )
      }
    } else if (options.action === 'MESSAGE_DELETE') {
      if (options.oldContent) {
        embed.addField(
          'Content',
          options.oldContent.length > 1024
            ? `${options.oldContent.substring(0, 1021)}...`
            : options.oldContent,
          false
        )
      }
    }

    // Send to logs channel
    await logsChannel.createMessage({
      embeds: [embed]
    })
  } catch (error) {
    console.error('Failed to log message action:', error)
  }
}

function getActionEmoji(action: string): string {
  switch (action) {
    case 'BAN':
      return '🔨'
    case 'UNBAN':
      return '🔓'
    case 'KICK':
      return '👢'
    case 'TIMEOUT':
      return '⏰'
    case 'MESSAGE_EDIT':
      return '✏️'
    case 'MESSAGE_DELETE':
      return '🗑️'
    default:
      return '⚖'
  }
}

function getActionColor(action: string): number {
  switch (action) {
    case 'BAN':
      return colors.RED
    case 'UNBAN':
      return colors.GREEN
    case 'KICK':
      return colors.YELLOW
    case 'TIMEOUT':
      return colors.ORANGE
    case 'MESSAGE_EDIT':
      return colors.BLUE
    case 'MESSAGE_DELETE':
      return colors.PURPLE
    default:
      return colors.BLUE
  }
}
