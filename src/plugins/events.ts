import type { Guild } from 'oceanic.js'
import ms from 'pretty-ms'
import { type Client, type Context, Embed, definePlugin } from '#framework'

export default definePlugin({
  name: 'Events',
  onLoad(client) {
    client.on('guildCreate', async (guild) => guildCreate(client, guild))
    client.on('commandError', commandError)
    client.on('ownerOnlyCommand', ownerOnlyCommand)
    client.on('commandCooldown', commandCooldown)
    client.on('guildOnlyCommand', guildOnlyCommand)
    client.on('noPermissions', noPermissions)
    client.on('commandCheckFail', commandCheckFail)
  },
  onUnload(client) {
    client.off('guildCreate', async (guild) => guildCreate(client, guild))
    client.off('commandError', commandError)
    client.off('ownerOnlyCommand', ownerOnlyCommand)
    client.off('commandCooldown', commandCooldown)
    client.off('guildOnlyCommand', guildOnlyCommand)
    client.off('noPermissions', noPermissions)
    client.off('commandCheckFail', commandCheckFail)
  }
})

async function guildCreate(client: Client, guild: Guild) {
  await client.prisma.config.create({
    data: {
      guildId: BigInt(guild.id),
      modules: [],
      currency: '🍣',
      reportsChannel: null
    }
  })
}

async function ownerOnlyCommand(ctx: Context) {
  await ctx.reply('You cannot run this command, lmao', true)
}

async function commandCooldown(ctx: Context, secsLeft: number) {
  await ctx.reply(`:warning: You can use command after ${ms(secsLeft)}.`, true)
}

async function guildOnlyCommand(ctx: Context) {
  await ctx.reply('command can only be ran in servers.', true)
}

async function noPermissions(ctx: Context, permissions: string[]) {
  await ctx.reply(
    `> :x: You don't have permissions to use command. Required permissions: ${permissions.join()}`,
    true
  )
}

async function commandError(ctx: Context, error: Error) {
  const embed = new Embed()
    .setColor(ctx.colors.RED)
    .setTitle(':x: Error!!')
    .setDescription("A error occurred, I'll report it here:")
    .addField('Name', error.name)
    .addField('Message', error.message)
    .addField('Stacktrace', error.stack ?? 'undefined')
    .addField('Cause', (error.cause as string) ?? 'undefined')
  await ctx.reply([embed])
}

async function commandCheckFail(ctx: Context) {
  await ctx.reply('The command check failed.')
}
