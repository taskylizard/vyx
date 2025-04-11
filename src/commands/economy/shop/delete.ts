import { defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'delete',
  description: 'Delete a shop item.',
  options: {
    item: {
      description: 'Name of the item.',
      required: true,
      type: 'string'
    }
  },
  async run(ctx) {
    const name = ctx.options.getString('item', true)
    const itemObj = await ctx.client.modules.shop.get(
      ctx.interaction.guildID!,
      name
    )

    if (!itemObj) {
      await ctx.client.application.getGlobalCommands()
      return await ctx.reply(
        'Shop item could not be found. Check items using `/shop list` .'
      )
    }

    if (!ctx.interaction.memberPermissions?.has('MANAGE_GUILD')) {
      return await ctx.reply(
        "You don't have the permissions needed to create a item! Needed permissions: Manage guild"
      )
    }

    await ctx.reply('Successfully deleted the item.')

    return await ctx.client.modules.shop.delete(ctx.interaction.guildID!, name)
  }
})
