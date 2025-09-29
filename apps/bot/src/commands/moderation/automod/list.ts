import { colors, defineSlashCommand, Embed, truncateString } from '#framework'
import type { AutomodRule } from '@packages/database'
import { ensureModerationModule } from './index'

export default defineSlashCommand({
  name: 'list',
  description: 'List all automod rules for this server',
  async run(ctx) {
    const config = await ensureModerationModule(ctx)
    if (!config) return

    const guildId = BigInt(ctx.interaction.guildID!)

    const rules = await ctx.client.prisma.automodRule.findMany({
      where: {
        guildId
      },
      orderBy: {
        id: 'asc'
      }
    })

    if (!rules.length) {
      await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.YELLOW)
            .setTitle('No Automod Rules')
            .setDescription('Use `/automod add` to create your first rule')
        ],
        flags: 64
      })
      return
    }

    const lines = rules.map((rule: AutomodRule) => {
      const status = rule.enabled ? '✅ Enabled' : '❌ Disabled'
      const label = rule.type === 'WORD' ? 'Word' : 'Regex'
      return `#${rule.id} • ${status} • ${label}\n${
        truncateString(rule.pattern, 120)
      }`
    })

    await ctx.reply({
      embeds: [
        new Embed()
          .setColor(colors.BLUE)
          .setTitle('Automod Rules')
          .setDescription(lines.join('\n\n'))
      ]
    })
  }
})
