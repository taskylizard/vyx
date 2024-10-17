import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { defineSlashCommand } from '#framework'

export default defineSlashCommand({
  moduleId: 'REPORT',
  guildOnly: true,
  requiredPermissions: ['VIEW_AUDIT_LOG', 'MANAGE_GUILD'],
  name: 'reports',
  description: 'Set or remove the server reports channel.',
  options: [
    {
      name: 'channel',
      description:
        "The report channel, don't pass anything to disable reporting.",
      type: ApplicationCommandOptionTypes.CHANNEL
    }
  ],
  async run(ctx) {
    const reportsChannel = ctx.options.getChannel('channel')
      ? BigInt(ctx.options.getChannel('channel', true).id)
      : null

    await ctx.client.prisma.config.upsert({
      where: {
        guildId: BigInt(ctx.interaction.guildID!)
      },
      update: {
        reportsChannel
      },
      create: {
        reportsChannel,
        guildId: BigInt(ctx.interaction.guildID!)
      }
    })

    const action = typeof reportsChannel === 'bigint' ? 'Set' : 'Disabled'
    return await ctx.reply(`${action} reports channel.`)
  }
})
