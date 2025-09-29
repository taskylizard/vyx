import { defineSlashCommand, Embed, type ShopItemConstructor } from '#framework'
import { ApplicationCommandOptionTypes } from 'oceanic.js'

export default defineSlashCommand({
  name: 'create',
  description: 'Create a new shop item.',
  options: [
    {
      name: 'name',
      description: 'Name of the item.',
      required: true,
      type: ApplicationCommandOptionTypes.STRING,
      minLength: 5,
      maxLength: 20
    },
    {
      name: 'description',
      description: 'Description of the item.',
      required: true,
      type: ApplicationCommandOptionTypes.STRING,
      maxLength: 50,
      minLength: 5
    },
    {
      name: 'price',
      description: 'Price of the item.',
      required: true,
      type: ApplicationCommandOptionTypes.INTEGER,
      minValue: 1
    },
    {
      name: 'role',
      description: 'A role reward on purchase.',
      type: ApplicationCommandOptionTypes.ROLE
    }
  ],
  async run(ctx) {
    const name = ctx.options.getString('name', true)
    const description = ctx.options.getString('description', true)
    const price = ctx.options.getInteger('price', true)
    const role = ctx.options.getRole('role')

    const obj: ShopItemConstructor = {
      name,
      description,
      price,
      guildId: BigInt(ctx.interaction.guildID!)
    }

    if (role) {
      obj.role = BigInt(role.id)
    }

    if (!ctx.interaction.memberPermissions!.has('MANAGE_GUILD')) {
      return await ctx.reply(
        "You don't have the permissions needed to create a item! Needed permissions: Manage guild"
      )
    }

    const existingItem = await ctx.client.modules.shop.get(
      ctx.interaction.guildID!,
      name
    )

    if (existingItem) {
      return await ctx.reply('That item already exists.')
    }

    const embed = new Embed()
      .setTitle('Successfully created a item!')
      .addFields([
        { name: 'Name', value: name },
        { name: 'Description', value: description },
        {
          name: 'Price',
          value: `${price} ${await ctx.client.modules.economy.getCurrency(
            ctx.interaction.guildID!
          )}`
        }
      ])

    await ctx.reply([embed])
    return await ctx.client.modules.shop.add(obj)
  }
})
