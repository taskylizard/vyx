import { defineSlashCommand } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

export default defineSlashCommand({
  name: 'withdraw',
  description: 'Withdraw money from your wallet.',
  options: [
    {
      name: 'amount',
      description: 'The amount to be withdrawn.',
      required: true,
      type: ApplicationCommandOptionTypes.INTEGER,
      minValue: 1
    }
  ],
  async run(ctx) {
    const toWithdraw = ctx.options.getInteger('amount', true)
    const balance = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      ctx.interaction.user
    )

    if (balance!.bankBal < toWithdraw) {
      return ctx.reply("You don't have enough balance in your bank!")
    }

    await ctx.reply(
      `Successfully withdrew ${toWithdraw} ${await ctx.client.modules.economy
        .getCurrency(
          ctx.interaction.guildID!
        )} from your bank!`
    )

    await ctx.client.modules.economy.withdraw(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      toWithdraw
    )
  }
})
