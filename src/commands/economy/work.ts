import { Embed, defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'work',
  description: 'Get money from working!',
  async run(ctx) {
    const random = Math.floor(Math.random() * 3)
    const money = Math.floor(Math.random() * 150 + 50)

    const messages = [
      'You coded a discord bot from a commission! You were paid ',
      "You worked at McDonald's and earned ",
      'You coded a website for a small company! They paid you '
    ]

    const description = `${
      messages[random]
    }${money} ${await ctx.client.modules.economy.getCurrency(
      ctx.interaction.guildID!
    )}`

    const embed = new Embed()
      .setTitle('You worked!')
      .setDescription(description)

    await ctx.client.modules.economy.add(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      money
    )
    return ctx.reply([embed])
  }
})
