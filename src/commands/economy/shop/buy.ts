import { defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'buy',
  description: 'Buy a shop item.',
  options: {
    item: {
      description: 'Name of the item.',
      type: 'string',
      required: true
    }
  },
  async run(ctx) {
    const item = ctx.options.getString('item', true)
    const itemObj = await ctx.client.modules.shop.get(
      ctx.interaction.guildID!,
      item
    )
    const user = await ctx.client.modules.economy.get(
      ctx.interaction.guildID!,
      ctx.interaction.user
    )

    if (!itemObj) {
      return await ctx.reply(
        'Shop item could not be found. Check items using `/shop list` .'
      )
    }

    if (itemObj.price > user!.walletBal) {
      return await ctx.reply("You don't have that much money!")
    }

    await ctx.reply(
      `Successfully bought ${itemObj.name} for ${
        itemObj.price
      } ${await ctx.client.modules.economy.getCurrency(
        ctx.interaction.guildID!
      )}`
    )

    if (itemObj.role) {
      const role = ctx.interaction.guild!.roles.get(itemObj.role.toString())

      if (role) {
        await ctx.client.rest.guilds.addMemberRole(
          ctx.interaction.guildID!,
          ctx.interaction.user.id,
          role.id,
          `Purchased the ${itemObj.name} shop item.`
        )
      }
    }

    return await ctx.client.modules.economy.subtract(
      ctx.interaction.guildID!,
      ctx.interaction.user,
      itemObj.price
    )
  }
})
