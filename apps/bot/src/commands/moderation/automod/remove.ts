import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { invalidateAutomodCache } from '../../../automod'
import { ensureModerationModule } from '.'

export default defineSlashCommand({
  name: 'remove',
  description: 'Remove an automod rule by its ID',
  options: [
    {
      name: 'id',
      description: 'Rule ID',
      type: ApplicationCommandOptionTypes.INTEGER,
      required: true
    }
  ],
  async run(ctx) {
    const config = await ensureModerationModule(ctx)
    if (!config) return

    const id = ctx.options.getInteger('id', true)
    const guildId = BigInt(ctx.interaction.guildID!)

    const rule = await ctx.client.prisma.automodRule.findUnique({
      where: { id }
    })

    if (!rule || rule.guildId !== guildId) {
      await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Rule Not Found')
            .setDescription(`No automod rule found with ID #${id}`)
        ],
        flags: 64
      })
      return
    }

    await ctx.client.prisma.automodRule.delete({ where: { id } })
    invalidateAutomodCache(ctx.interaction.guildID!)

    await ctx.reply({
      embeds: [
        new Embed()
          .setColor(colors.GREEN)
          .setTitle('Automod Rule Removed')
          .setDescription(`Removed rule #${id}`)
      ]
    })
  }
})
