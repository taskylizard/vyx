import { defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'currency',
  description: 'Set the server economy currency.',
  requiredPermissions: ['MANAGE_GUILD'],
  options: {
    currency: {
      description: 'Your currency, can be a emoji or text.',
      required: true,
      type: 'string'
    }
  },
  async run(ctx) {
    const value = ctx.options.getString('currency', true)

    await ctx.client.prisma.config.update({
      where: {
        guildId: BigInt(ctx.interaction.guildID!)
      },
      data: {
        currency: value
      }
    })

    return await ctx.reply(`Successfully set currency to ${value}.`)
  }
})
