import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

export default defineSlashCommand({
  moduleId: 'MODERATION',
  name: 'logging',
  description: 'Configure message and moderation logging settings',
  guildOnly: true,
  requiredPermissions: ['MANAGE_GUILD'],
  subcommands: [
    {
      name: 'configure',
      description: 'Configure logging settings',
      options: [
        {
          name: 'moderation_actions',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Enable/disable moderation action logging',
          required: false
        },
        {
          name: 'message_edits',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Enable/disable message edit logging',
          required: false
        },
        {
          name: 'message_deletes',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Enable/disable message delete logging',
          required: false
        },
        {
          name: 'member_joins',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Enable/disable member join logging',
          required: false
        },
        {
          name: 'member_leaves',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Enable/disable member leave logging',
          required: false
        },
        {
          name: 'channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set the main logging channel',
          required: false
        },
        {
          name: 'moderation_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set dedicated channel for moderation actions',
          required: false
        },
        {
          name: 'message_edit_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set dedicated channel for message edits',
          required: false
        },
        {
          name: 'message_delete_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set dedicated channel for message deletes',
          required: false
        },
        {
          name: 'member_join_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set dedicated channel for member joins',
          required: false
        },
        {
          name: 'member_leave_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set dedicated channel for member leaves',
          required: false
        },
        {
          name: 'new_account_threshold',
          type: ApplicationCommandOptionTypes.INTEGER,
          description: 'Days to consider account as new (default: 7)',
          required: false,
          minValue: 1,
          maxValue: 365
        },
        {
          name: 'trap_channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Channel to monitor for hacked accounts',
          required: false
        },
        {
          name: 'trap_action',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Action to take on trapped accounts',
          required: false,
          choices: [
            { name: 'Softban', value: 'SOFTBAN' },
            { name: 'Ban', value: 'BAN' },
            { name: 'Kick', value: 'KICK' },
            { name: 'Timeout', value: 'TIMEOUT' }
          ]
        },
        {
          name: 'trap_duration',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Duration for timeout/softban (e.g., 7d, 12h)',
          required: false
        }
      ],
      async run(ctx) {
        const config = await ctx.client.prisma.config.findUnique({
          where: { guildId: BigInt(ctx.interaction.guildID!) }
        })

        if (!config || !config.modules.includes('MODERATION')) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.RED)
                .setTitle('Moderation Module Not Enabled')
                .setDescription(
                  'Please enable the moderation module first using `/modules enable moderation`.'
                )
            ],
            flags: 64
          })
        }

        const moderationActions = ctx.options.getBoolean('moderation_actions')
        const messageEdits = ctx.options.getBoolean('message_edits')
        const messageDeletes = ctx.options.getBoolean('message_deletes')
        const memberJoins = ctx.options.getBoolean('member_joins')
        const memberLeaves = ctx.options.getBoolean('member_leaves')
        const channel = ctx.options.getChannel('channel')
        const moderationChannel = ctx.options.getChannel('moderation_channel')
        const messageEditChannel = ctx.options.getChannel(
          'message_edit_channel'
        )
        const messageDeleteChannel = ctx.options.getChannel(
          'message_delete_channel'
        )
        const memberJoinChannel = ctx.options.getChannel('member_join_channel')
        const memberLeaveChannel = ctx.options.getChannel(
          'member_leave_channel'
        )
        const newAccountThreshold = ctx.options.getInteger(
          'new_account_threshold'
        )
        const trapChannel = ctx.options.getChannel('trap_channel')
        const trapAction = ctx.options.getString('trap_action')
        const trapDuration = ctx.options.getString('trap_duration')

        const updateData: Record<string, unknown> = {}
        const changes: string[] = []

        if (moderationActions !== null) {
          updateData.logModerationActions = moderationActions
          changes.push(
            `Moderation actions: ${
              moderationActions ? '✅ Enabled' : '❌ Disabled'
            }`
          )
        }

        if (messageEdits !== null) {
          updateData.logMessageEdits = messageEdits
          changes.push(
            `Message edits: ${messageEdits ? '✅ Enabled' : '❌ Disabled'}`
          )
        }

        if (messageDeletes !== null) {
          updateData.logMessageDeletes = messageDeletes
          changes.push(
            `Message deletes: ${messageDeletes ? '✅ Enabled' : '❌ Disabled'}`
          )
        }

        if (memberJoins !== null) {
          updateData.logMemberJoins = memberJoins
          changes.push(
            `Member joins: ${memberJoins ? '✅ Enabled' : '❌ Disabled'}`
          )
        }

        if (memberLeaves !== null) {
          updateData.logMemberLeaves = memberLeaves
          changes.push(
            `Member leaves: ${memberLeaves ? '✅ Enabled' : '❌ Disabled'}`
          )
        }

        if (channel) {
          updateData.logsChannel = BigInt(channel.id)
          updateData.logsEnabled = true
          changes.push(`Main logging channel: ${channel.mention}`)
        }

        if (moderationChannel) {
          updateData.moderationActionsChannel = BigInt(moderationChannel.id)
          changes.push(`Moderation channel: ${moderationChannel.mention}`)
        }

        if (messageEditChannel) {
          updateData.messageEditChannel = BigInt(messageEditChannel.id)
          changes.push(`Message edit channel: ${messageEditChannel.mention}`)
        }

        if (messageDeleteChannel) {
          updateData.messageDeleteChannel = BigInt(messageDeleteChannel.id)
          changes.push(
            `Message delete channel: ${messageDeleteChannel.mention}`
          )
        }

        if (memberJoinChannel) {
          updateData.memberJoinChannel = BigInt(memberJoinChannel.id)
          changes.push(`Member join channel: ${memberJoinChannel.mention}`)
        }

        if (memberLeaveChannel) {
          updateData.memberLeaveChannel = BigInt(memberLeaveChannel.id)
          changes.push(`Member leave channel: ${memberLeaveChannel.mention}`)
        }

        if (newAccountThreshold !== null) {
          updateData.newAccountThresholdDays = newAccountThreshold
          changes.push(`New account threshold: ${newAccountThreshold} days`)
        }

        if (trapChannel) {
          updateData.trapChannel = BigInt(trapChannel.id)
          changes.push(`Trap channel: ${trapChannel.mention}`)
        }

        if (trapAction) {
          updateData.trapAction = trapAction
          changes.push(`Trap action: ${trapAction}`)
        }

        if (trapDuration) {
          updateData.trapDuration = trapDuration
          changes.push(`Trap duration: ${trapDuration}`)
        }

        if (changes.length === 0) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.YELLOW)
                .setTitle('No Changes Made')
                .setDescription(
                  'Please specify at least one setting to update.'
                )
            ],
            flags: 64
          })
        }

        await ctx.client.prisma.config.update({
          where: { guildId: BigInt(ctx.interaction.guildID!) },
          data: updateData
        })

        return await ctx.reply({
          embeds: [
            new Embed()
              .setColor(colors.GREEN)
              .setTitle('🔧 Logging Configuration Updated')
              .setDescription(changes.join('\n'))
              .setTimestamp()
          ]
        })
      }
    },
    {
      name: 'status',
      description: 'View current logging configuration',
      async run(ctx) {
        const config = await ctx.client.prisma.config.findUnique({
          where: { guildId: BigInt(ctx.interaction.guildID!) }
        })

        if (!config || !config.modules.includes('MODERATION')) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.RED)
                .setTitle('Moderation Module Not Enabled')
                .setDescription(
                  'Please enable the moderation module first using `/modules enable moderation`.'
                )
            ],
            flags: 64
          })
        }

        const embed = new Embed()
          .setColor(colors.BLUE)
          .setTitle('📊 Current Logging Configuration')
          .addField(
            'Logging Enabled',
            config.logsEnabled ? '✅ Yes' : '❌ No',
            true
          )
          .addField(
            'Main Logging Channel',
            config.logsChannel ? `<#${config.logsChannel}>` : '❌ Not Set',
            true
          )
          .addField(
            'Moderation Actions',
            config.logModerationActions ? '✅ Enabled' : '❌ Disabled',
            true
          )
          .addField(
            'Message Edits',
            config.logMessageEdits ? '✅ Enabled' : '❌ Disabled',
            true
          )
          .addField(
            'Message Deletes',
            config.logMessageDeletes ? '✅ Enabled' : '❌ Disabled',
            true
          )
          .addField(
            'Member Joins',
            config.logMemberJoins ? '✅ Enabled' : '❌ Disabled',
            true
          )
          .addField(
            'Member Leaves',
            config.logMemberLeaves ? '✅ Enabled' : '❌ Disabled',
            true
          )
          .addField(
            'Moderation Channel',
            config.moderationActionsChannel
              ? `<#${config.moderationActionsChannel}>`
              : '❌ Not Set',
            true
          )
          .addField(
            'Message Edit Channel',
            config.messageEditChannel
              ? `<#${config.messageEditChannel}>`
              : '❌ Not Set',
            true
          )
          .addField(
            'Message Delete Channel',
            config.messageDeleteChannel
              ? `<#${config.messageDeleteChannel}>`
              : '❌ Not Set',
            true
          )
          .addField(
            'Member Join Channel',
            config.memberJoinChannel
              ? `<#${config.memberJoinChannel}>`
              : '❌ Not Set',
            true
          )
          .addField(
            'Member Leave Channel',
            config.memberLeaveChannel
              ? `<#${config.memberLeaveChannel}>`
              : '❌ Not Set',
            true
          )
          .addField(
            'New Account Threshold',
            `${config.newAccountThresholdDays ?? 7} days`,
            true
          )
          .addField(
            'Trap Channel',
            config.trapChannel ? `<#${config.trapChannel}>` : '❌ Not Set',
            true
          )
          .addField(
            'Trap Action',
            config.trapAction ?? 'SOFTBAN',
            true
          )
          .addField(
            'Trap Duration',
            config.trapDuration ?? 'Not Set',
            true
          )
          .setTimestamp()

        return await ctx.reply({ embeds: [embed] })
      }
    }
  ]
})
