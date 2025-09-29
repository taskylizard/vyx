import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { logModerationAction } from './utils'

export default defineSlashCommand({
  name: 'unban',
  description: 'Unban a user from the server',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'The user ID or username to unban',
      required: true
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'The reason for the unban',
      required: false
    }
  ],
  requiredPermissions: ['BAN_MEMBERS'],
  async run(ctx) {
    const userInput = ctx.options.getString('user', true)
    const reason = ctx.options.getString('reason') ?? 'No reason provided'

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

    try {
      let userId = userInput

      if (!/^\d{17,19}$/.test(userInput)) {
        const bans = await ctx.guild?.getBans()
        const ban = bans?.find(
          (ban) =>
            ban.user.username
              .toLowerCase()
              .includes(userInput.toLowerCase()) ||
            `${ban.user.username}#${ban.user.discriminator}` === userInput
        )

        if (!ban) {
          return await ctx.reply({
            embeds: [
              new Embed()
                .setColor(colors.RED)
                .setTitle('User Not Found')
                .setDescription(
                  'Could not find a banned user matching that username. Try using their user ID instead.'
                )
            ],
            flags: 64
          })
        }

        userId = ban.user.id
      }

      const bans = await ctx.guild?.getBans()
      const existingBan = bans?.find((ban) => ban.user.id === userId)

      if (!existingBan) {
        return await ctx.reply({
          embeds: [
            new Embed()
              .setColor(colors.RED)
              .setTitle('User Not Banned')
              .setDescription(
                'This user is not currently banned from the server.'
              )
          ],
          flags: 64
        })
      }

      await ctx.guild?.removeBan(
        userId,
        `${reason} | Unbanned by ${ctx.interaction.user.username}`
      )

      await logModerationAction(ctx, {
        action: 'UNBAN',
        moderator: ctx.interaction.user.username,
        moderatorId: ctx.interaction.user.id,
        target: existingBan.user.username,
        targetId: existingBan.user.id,
        reason
      })

      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.GREEN)
            .setTitle('User Unbanned')
            .setDescription(
              `**${existingBan.user.username}** has been unbanned from the server.`
            )
            .addField('Reason', reason, true)
            .addField('Moderator', ctx.interaction.user.mention, true)
            .setTimestamp()
        ]
      })
    } catch (error) {
      console.error('Unban command error:', error)
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Unban Failed')
            .setDescription(
              'Failed to unban the user. Please check the user ID is correct and that I have sufficient permissions.'
            )
        ],
        flags: 64
      })
    }
  }
})
