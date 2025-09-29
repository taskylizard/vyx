import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { logModerationAction } from './utils'

export default defineSlashCommand({
  name: 'ban',
  description: 'Ban a user from the server',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionTypes.USER,
      description: 'The user to ban',
      required: true
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'The reason for the ban',
      required: false
    },
    {
      name: 'delete_message_days',
      type: ApplicationCommandOptionTypes.INTEGER,
      description: 'Delete messages from the past X days (0-7)',
      required: false,
      minValue: 0,
      maxValue: 7
    }
  ],
  requiredPermissions: ['BAN_MEMBERS'],
  async run(ctx) {
    const user = ctx.options.getUser('user', true)
    const reason = ctx.options.getString('reason') ?? 'No reason provided'
    const deleteMessageDays = ctx.options.getInteger('delete_message_days') ?? 0

    if (!ctx.interaction.member?.permissions.has('BAN_MEMBERS')) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Insufficient Permissions')
            .setDescription(
              'You need the **Ban Members** permission to use this command.'
            )
        ],
        flags: 64
      })
    }

    if (user.id === ctx.interaction.user.id) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Invalid Target')
            .setDescription('You cannot ban yourself.')
        ],
        flags: 64
      })
    }

    if (user.id === ctx.client.user.id) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Invalid Target')
            .setDescription('I cannot ban myself.')
        ],
        flags: 64
      })
    }

    try {
      const targetMember = ctx.guild?.members.get(user.id)
      const executorMember = ctx.interaction.member!

      if (targetMember) {
        const targetHighestRole = targetMember.roles.reduce(
          (highest: number, roleId: string) => {
            const role = ctx.guild?.roles.get(roleId)
            return role && role.position > highest ? role.position : highest
          },
          0
        )

        const executorHighestRole = executorMember.roles.reduce(
          (highest: number, roleId: string) => {
            const role = ctx.guild?.roles.get(roleId)
            return role && role.position > highest ? role.position : highest
          },
          0
        )

        if (
          targetHighestRole >= executorHighestRole &&
          ctx.guild?.ownerID !== executorMember.id
        ) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.RED)
                .setTitle('Insufficient Permissions')
                .setDescription(
                  'You cannot ban someone with an equal or higher role than you.'
                )
            ],
            flags: 64
          })
        }

        if (targetMember.id === ctx.guild?.ownerID) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.RED)
                .setTitle('Invalid Target')
                .setDescription('You cannot ban the server owner.')
            ],
            flags: 64
          })
        }
      }

      await ctx.guild?.createBan(user.id, {
        reason: `${reason} | Banned by ${ctx.interaction.user.username}`,
        deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
      })

      await logModerationAction(ctx, {
        action: 'BAN',
        moderator: ctx.interaction.user.username,
        moderatorId: ctx.interaction.user.id,
        target: user.username,
        targetId: user.id,
        reason,
        additional: {
          'Messages Deleted': `${deleteMessageDays} day(s)`
        }
      })

      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.GREEN)
            .setTitle('User Banned')
            .setDescription(
              `**${user.username}** has been banned from the server.`
            )
            .addField('Reason', reason, true)
            .addField('Moderator', ctx.interaction.user.mention, true)
            .addField(
              'Messages Deleted',
              `${deleteMessageDays} day(s)`,
              true
            )
            .setTimestamp()
        ]
      })
    } catch (error) {
      console.error('Ban command error:', error)
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Ban Failed')
            .setDescription(
              'Failed to ban the user. They may have already been banned or I may lack sufficient permissions.'
            )
        ],
        flags: 64
      })
    }
  }
})
