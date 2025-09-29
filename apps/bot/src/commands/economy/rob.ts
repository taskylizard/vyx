import { defineSlashCommand, Embed } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

export default defineSlashCommand({
  name: 'rob',
  description: 'Rob someone of their money.',
  options: [
    {
      name: 'user',
      description: 'The person you wanna rob.',
      required: true,
      type: ApplicationCommandOptionTypes.USER
    }
  ],
  async run(ctx) {
    const user = ctx.options.getUser('user', true)

    if (user.id === ctx.user.id) {
      return ctx.reply("You can't rob yourself.")
    }

    if (!ctx.guild?.members.get(user.id)) {
      return ctx.reply('That user could not be found.')
    }

    const userBalance = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      user
    )
    const robberBalance = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      ctx.interaction.user
    )

    const earnedPercent = Math.round(Math.random() * 20) + 20
    const earned = Math.round(userBalance!.walletBal * (earnedPercent / 100))
    const chance = Math.random() * 100
    const currency = await ctx.client.modules.economy.getCurrency(
      ctx.interaction.guildID!
    )

    if (userBalance!.walletBal < 0) {
      return ctx.reply(
        "You tried to rob them, but they didn't have any money in their wallet!"
      )
    }

    if (chance > 40) {
      const lost = Math.round(
        (robberBalance!.bankBal + robberBalance!.walletBal) * (earned / 100)
      )
      await ctx.client.modules.economy.subtract(
        ctx.interaction.guildID!,
        ctx.interaction.user,
        lost
      )

      return ctx.reply(
        `You tried to rob them, but they caught you! You got fined ${lost} ${currency}`
      )
    }

    const embed = new Embed()
      .setTitle(`You robbed ${user.username}`)
      .setDescription(`You took their wallet! You got ${earned} ${currency}`)

    await ctx.client.modules.economy.add(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      earned
    )
    await ctx.client.modules.economy.subtract(
      ctx.interaction.guildID!,
      user,
      earned
    )

    return ctx.reply([embed])
  }
})
