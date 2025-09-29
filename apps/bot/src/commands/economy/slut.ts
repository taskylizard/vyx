import { defineSlashCommand, Embed } from '#framework'

export default defineSlashCommand({
  name: 'slut',
  description: 'Get money by being a slut!',
  async run(ctx) {
    const money = Math.floor(Math.random() * 200 + 50)

    const embed = new Embed()
      .setTitle('You worked as a slut!')
      .setDescription(
        `You worked as a slut for 2 hours! You earned ${money} ${await ctx
          .client.modules.economy.getCurrency(
            ctx.interaction.guildID!
          )}`
      )
    await ctx.client.modules.economy.add(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      money
    )

    return ctx.reply([embed])
  }
})
