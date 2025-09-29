import { defineSlashCommand } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

export default defineSlashCommand({
  name: 'deposit',
  description: 'Deposit your money in the bank.',
  options: [
    {
      name: 'amount',
      description: 'The amount to deposit',
      required: true,
      type: ApplicationCommandOptionTypes.INTEGER
    }
  ],
  async run(ctx) {
    const toDeposit = ctx.options.getInteger('amount', true)
    const balance = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      ctx.interaction.user
    )

    if (balance!.walletBal < toDeposit) {
      return await ctx.reply("You don't have that much money!")
    }

    await ctx.reply(
      `Successfully deposited ${toDeposit} ${await ctx.client.modules.economy
        .getCurrency(
          ctx.interaction.guildID!
        )} to your bank!`
    )

    await ctx.client.modules.economy.deposit(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      toDeposit
    )
  }
})
