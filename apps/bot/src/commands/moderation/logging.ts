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
          name: 'channel',
          type: ApplicationCommandOptionTypes.CHANNEL,
          description: 'Set the logging channel',
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
        const channel = ctx.options.getChannel('channel')

        const updateData: any = {}
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

        if (channel) {
          updateData.logsChannel = BigInt(channel.id)
          updateData.logsEnabled = true
          changes.push(`Logging channel: ${channel.mention}`)
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
            'Logging Channel',
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
          .setTimestamp()

        return await ctx.reply({ embeds: [embed] })
      }
    }
  ]
})
