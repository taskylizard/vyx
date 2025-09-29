import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { logModerationAction } from './utils'

export default defineSlashCommand({
  name: 'kick',
  description: 'Kick a user from the server',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionTypes.USER,
      description: 'The user to kick',
      required: true
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'The reason for the kick',
      required: false
    }
  ],
  requiredPermissions: ['KICK_MEMBERS'],
  async run(ctx) {
    const user = ctx.options.getUser('user', true)
    const reason = ctx.options.getString('reason') ?? 'No reason provided'

    if (!ctx.interaction.member?.permissions.has('KICK_MEMBERS')) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Insufficient Permissions')
            .setDescription(
              'You need the **Kick Members** permission to use this command.'
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
            .setDescription('You cannot kick yourself.')
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
            .setDescription('I cannot kick myself.')
        ],
        flags: 64
      })
    }

    try {
      const targetMember = ctx.guild?.members.get(user.id)
      if (!targetMember) {
        return await ctx.reply({
          embeds: [
            new Embed()
              .setColor(colors.RED)
              .setTitle('User Not Found')
              .setDescription('This user is not in the server.')
          ],
          flags: 64
        })
      }

      const executorMember = ctx.interaction.member!

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
                'You cannot kick someone with an equal or higher role than you.'
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
              .setDescription('You cannot kick the server owner.')
          ],
          flags: 64
        })
      }

      await targetMember.kick(
        `${reason} | Kicked by ${ctx.interaction.user.username}`
      )

      await logModerationAction(ctx, {
        action: 'KICK',
        moderator: ctx.interaction.user.username,
        moderatorId: ctx.interaction.user.id,
        target: user.username,
        targetId: user.id,
        reason
      })

      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.YELLOW)
            .setTitle('User Kicked')
            .setDescription(
              `**${user.username}** has been kicked from the server.`
            )
            .addField('Reason', reason, true)
            .addField('Moderator', ctx.interaction.user.mention, true)
            .setTimestamp()
        ]
      })
    } catch (error) {
      console.error('Kick command error:', error)
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Kick Failed')
            .setDescription(
              'Failed to kick the user. I may lack sufficient permissions.'
            )
        ],
        flags: 64
      })
    }
  }
})
