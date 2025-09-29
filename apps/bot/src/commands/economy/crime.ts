import { defineSlashCommand, Embed } from '#framework'

export default defineSlashCommand({
  name: 'crime',
  description: 'Commit heinous crimes.',
  cooldown: 3000,
  async run(ctx) {
    const currency = await ctx.client.modules.economy.getCurrency(
      ctx.interaction.guildID!
    )
    const random = Math.floor(Math.random() * 10)

    if (random > 7) {
      const money = Math.floor(Math.random() * 200) + 50

      await ctx.reply(
        `The police caught you! You got fined ${money} ${currency}`
      )

      return await ctx.client.modules.economy.subtract(
        ctx.interaction.guildID!,
        ctx.interaction.user,
        money
      )
    }

    const money = Math.floor(Math.random() * 200) + 100

    const messages = [
      'You robbed a bank! You got ',
      "You stole someone's wallet! You found ",
      'You broke into a house and stole '
    ]

    const description = `${
      messages[Math.floor(Math.random() * 3)]
    }${money} ${currency}`

    const embed = new Embed()
      .setTitle('You committed a crime!')
      .setDescription(description)

    await ctx.reply([embed])
    return await ctx.client.modules.economy.add(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      money
    )
  }
})
