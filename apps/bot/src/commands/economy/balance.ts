import { Embed, defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'balance',
  description: 'Show your current balance.',
  async run(ctx) {
    const balance = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      ctx.interaction.user
    )
    const currency = await ctx.client.modules.economy.getCurrency(
      ctx.interaction.guildID!
    )

    const embed = new Embed().setTitle('Balance').addFields([
      {
        name: 'Wallet',
        value: `${balance?.walletBal} ${currency}`
      },
      { name: 'Bank', value: `${balance?.bankBal} ${currency}` }
    ])

    return ctx.reply([embed])
  }
})
