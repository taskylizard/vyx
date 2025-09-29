import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { logModerationAction } from './utils'

export default defineSlashCommand({
  name: 'timeout',
  description: 'Timeout a user in the server',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionTypes.USER,
      description: 'The user to timeout',
      required: true
    },
    {
      name: 'duration',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'Duration (e.g., 10m, 1h, 1d)',
      required: true,
      choices: [
        { name: '5 minutes', value: '5m' },
        { name: '10 minutes', value: '10m' },
        { name: '30 minutes', value: '30m' },
        { name: '1 hour', value: '1h' },
        { name: '6 hours', value: '6h' },
        { name: '12 hours', value: '12h' },
        { name: '1 day', value: '1d' },
        { name: '1 week', value: '7d' }
      ]
    },
    {
      name: 'reason',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'The reason for the timeout',
      required: false
    }
  ],
  requiredPermissions: ['MODERATE_MEMBERS'],
  async run(ctx) {
    const user = ctx.options.getUser('user', true)
    const duration = ctx.options.getString('duration', true)
    const reason = ctx.options.getString('reason') ?? 'No reason provided'

    if (!ctx.interaction.member?.permissions.has('MODERATE_MEMBERS')) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Insufficient Permissions')
            .setDescription(
              'You need the **Timeout Members** permission to use this command.'
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
            .setDescription('You cannot timeout yourself.')
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
            .setDescription('I cannot timeout myself.')
        ],
        flags: 64
      })
    }

    function parseDuration(durationStr: string): number {
      const match = durationStr.match(/^(\d+)([mhd])$/)
      if (!match) return 0

      const [, amount, unit] = match
      const num = Number.parseInt(amount || '0', 10)

      switch (unit) {
        case 'm':
          return num * 60 * 1000
        case 'h':
          return num * 60 * 60 * 1000
        case 'd':
          return num * 24 * 60 * 60 * 1000
        default:
          return 0
      }
    }

    const durationMs = parseDuration(duration)
    if (durationMs === 0 || durationMs > 28 * 24 * 60 * 60 * 1000) {
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Invalid Duration')
            .setDescription(
              'Duration must be between 1 minute and 28 days.'
            )
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
                'You cannot timeout someone with an equal or higher role than you.'
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
              .setDescription('You cannot timeout the server owner.')
          ],
          flags: 64
        })
      }

      const timeoutUntil = new Date(Date.now() + durationMs)

      function formatDuration(ms: number): string {
        const minutes = Math.floor(ms / (60 * 1000))
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (days > 0) return `${days} day(s)`
        if (hours > 0) return `${hours} hour(s)`
        return `${minutes} minute(s)`
      }

      await targetMember.edit({
        communicationDisabledUntil: timeoutUntil.toISOString()
      })

      await logModerationAction(ctx, {
        action: 'TIMEOUT',
        moderator: ctx.interaction.user.username,
        moderatorId: ctx.interaction.user.id,
        target: user.username,
        targetId: user.id,
        reason,
        duration: formatDuration(durationMs),
        additional: {
          'Timeout Ends': `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`
        }
      })

      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.ORANGE)
            .setTitle('User Timed Out')
            .setDescription(`**${user.username}** has been timed out.`)
            .addField('Duration', formatDuration(durationMs), true)
            .addField('Reason', reason, true)
            .addField('Moderator', ctx.interaction.user.mention, true)
            .addField(
              'Timeout Ends',
              `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:R>`,
              false
            )
            .setTimestamp()
        ]
      })
    } catch (error) {
      console.error('Timeout command error:', error)
      return await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Timeout Failed')
            .setDescription(
              'Failed to timeout the user. I may lack sufficient permissions.'
            )
        ],
        flags: 64
      })
    }
  }
})
