import { colors, defineSlashCommand, Embed, truncateString } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import { invalidateAutomodCache } from '../../../automod'
import { ensureModerationModule } from './index'

export default defineSlashCommand({
  name: 'add',
  description: 'Add a new automod rule',
  options: [
    {
      name: 'type',
      description: 'Rule type',
      type: ApplicationCommandOptionTypes.STRING,
      choices: [
        { name: 'Word', value: 'WORD' },
        { name: 'Regex', value: 'REGEX' }
      ],
      required: true
    },
    {
      name: 'pattern',
      description: 'Block content that matches a regex/pattern',
      type: ApplicationCommandOptionTypes.STRING,
      required: true
    }
  ],
  async run(ctx) {
    const config = await ensureModerationModule(ctx)
    if (!config) return
    const type = ctx.options.getString('type', true) as 'WORD' | 'REGEX'

    const pattern = ctx.options.getString('pattern', true).trim()
    if (!pattern.length) {
      await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.RED)
            .setTitle('Invalid Pattern')
            .setDescription('Provide a non-empty word to block')
        ],
        flags: 64
      })
      return
    }

    const guildId = BigInt(ctx.interaction.guildID!)

    const existing = await ctx.client.prisma.automodRule.findFirst({
      where: {
        guildId,
        pattern,
        type: type
      }
    })

    if (existing) {
      await ctx.reply({
        embeds: [
          new Embed()
            .setColor(colors.YELLOW)
            .setTitle('Rule Already Exists')
            .setDescription(`Rule #${existing.id} already blocks this word`)
        ],
        flags: 64
      })
      return
    }

    await ctx.client.prisma.automodRule.create({
      data: {
        guildId,
        pattern,
        type,
        createdBy: BigInt(ctx.user.id)
      }
    })

    invalidateAutomodCache(ctx.interaction.guildID!)

    const preview = truncateString(pattern, 100)

    await ctx.reply({
      embeds: [
        new Embed()
          .setColor(colors.GREEN)
          .setTitle('Automod Rule Added')
          .setDescription('Blocking ' + type + ' rule: ' + '`' + preview + '`')
      ]
    })
  }
})
