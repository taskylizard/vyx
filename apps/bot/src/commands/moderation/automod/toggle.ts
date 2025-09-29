import { colors, defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { invalidateAutomodCache } from '../../../automod'
import { ensureModerationModule } from '.'

export default defineSlashCommand({
  name: 'toggle',
  description: 'Enable or disable an automod rule',
  options: [
    {
      name: 'id',
      description: 'Rule ID',
      type: ApplicationCommandOptionTypes.INTEGER,
      required: true
    },
    {
      name: 'enabled',
      description: 'Set the rule status explicitly',
      type: ApplicationCommandOptionTypes.BOOLEAN,
      required: false
    }
  ],
  async run(ctx) {
    const config = await ensureModerationModule(ctx)
    if (!config) return

    const id = ctx.options.getInteger('id', true)
    const explicit = ctx.options.getBoolean('enabled')
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

    const newState = explicit ?? !rule.enabled

    await ctx.client.prisma.automodRule.update({
      where: { id },
      data: {
        enabled: newState
      }
    })

    invalidateAutomodCache(ctx.interaction.guildID!)

    await ctx.reply({
      embeds: [
        new Embed()
          .setColor(colors.GREEN)
          .setTitle('Automod Rule Updated')
          .setDescription(
            `Rule #${id} is now ${newState ? 'enabled' : 'disabled'}`
          )
      ]
    })
  }
})
