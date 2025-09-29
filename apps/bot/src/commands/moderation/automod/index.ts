import { colors, type Context, defineSlashCommand, Embed } from '#framework'
import add from './add'
import list from './list'
import remove from './remove'
import toggle from './toggle'

export async function ensureModerationModule(ctx: Context) {
  const config = await ctx.client.prisma.config.findUnique({
    where: { guildId: BigInt(ctx.interaction.guildID!) }
  })

  if (!config || !config.modules.includes('MODERATION')) {
    await ctx.reply({
      embeds: [
        new Embed()
          .setColor(colors.RED)
          .setTitle('Moderation Module Disabled')
          .setDescription(
            'Enable the moderation module first using `/modules enable moderation`.'
          )
      ],
      flags: 64
    })
    return null
  }

  return config
}

export default defineSlashCommand({
  name: 'automod',
  description: 'Moderation commands for managing automod rules',
  subcommands: [
    add,
    list,
    remove,
    toggle
  ]
})
