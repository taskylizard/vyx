import { defineSlashCommand, Embed } from '#framework'

export default defineSlashCommand({
  name: 'list',
  description: 'Show your server shop.',
  async run(ctx) {
    const list = await ctx.client.modules.shop.list(ctx.interaction.guildID!)
    const embed = new Embed().setTitle('Shop')

    const currency = await ctx.client.modules.economy.getCurrency(
      ctx.interaction.guildID!
    )

    if (list.length) {
      list.forEach((item: any) => {
        embed.addFields([
          {
            name: `${item.name} - ${item.price} ${currency}`,
            value: item.description
          }
        ])
      })
    } else {
      embed.setDescription('No items have been added.')
    }

    return ctx.reply([embed])
  }
})