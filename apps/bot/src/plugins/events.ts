import { type Client, type Context, definePlugin, Embed } from '#framework'
import type { Guild, Message, PossiblyUncachedMessage } from 'oceanic.js'
import ms from 'pretty-ms'
import { logMessageAction } from '../commands/moderation/utils'

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
    client.on(
      'messageUpdate',
      async (message, oldMessage) => messageUpdate(client, message, oldMessage)
    )
    client.on(
      'messageDelete',
      async (message) => messageDelete(client, message)
    )

    // Backfill configs for existing guilds on bot ready
    client.once('ready', async () => {
      await backfillGuildConfigs(client)
    })
  },
  onUnload(client) {
    client.off('guildCreate', async (guild) => guildCreate(client, guild))
    client.off('commandError', commandError)
    client.off('ownerOnlyCommand', ownerOnlyCommand)
    client.off('commandCooldown', commandCooldown)
    client.off('guildOnlyCommand', guildOnlyCommand)
    client.off('noPermissions', noPermissions)
    client.off('commandCheckFail', commandCheckFail)
    client.off(
      'messageUpdate',
      async (message, oldMessage) => messageUpdate(client, message, oldMessage)
    )
    client.off(
      'messageDelete',
      async (message) => messageDelete(client, message)
    )
  }
})

async function backfillGuildConfigs(client: Client) {
  const logger = client.logger.withTag('Config Backfill')

  try {
    logger.info('Starting guild config backfill...')

    // Get all guild IDs the bot is in
    const botGuilds = Array.from(client.guilds.keys())
    logger.info(`Found ${botGuilds.length} guilds`)

    // Get existing configs
    const existingConfigs = await client.prisma.config.findMany({
      select: { guildId: true }
    })
    const existingGuildIds = new Set(
      existingConfigs.map((config: { guildId: bigint }) =>
        config.guildId.toString()
      )
    )

    // Find guilds without configs
    const guildsNeedingConfigs = botGuilds.filter(guildId =>
      !existingGuildIds.has(guildId)
    )

    if (guildsNeedingConfigs.length === 0) {
      logger.info('All guilds already have configs')
      return
    }

    logger.info(`Creating configs for ${guildsNeedingConfigs.length} guilds`)

    // Create configs for missing guilds
    const configData = guildsNeedingConfigs.map(guildId => ({
      guildId: BigInt(guildId),
      modules: [],
      currency: '🍣',
      reportsChannel: null
    }))

    await client.prisma.config.createMany({
      data: configData,
      skipDuplicates: true
    })

    logger.success(
      `Successfully created ${guildsNeedingConfigs.length} guild configs`
    )
  } catch (error) {
    logger.error('Failed to backfill guild configs:', error)
  }
}

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

async function messageUpdate(
  client: Client,
  message: Message,
  oldMessage: any
) {
  if (!message.guildID || !oldMessage) return

  // Skip if content is the same (embed updates, etc.)
  if (message.content === oldMessage.content) return

  await logMessageAction(client, message.guildID, {
    action: 'MESSAGE_EDIT',
    message: message,
    oldContent: oldMessage.content,
    newContent: message.content
  })
}

async function messageDelete(client: Client, message: PossiblyUncachedMessage) {
  // Only handle cached messages for content logging
  if (!('guildID' in message) || !message.guildID || !('content' in message)) {
    return
  }

  await logMessageAction(client, message.guildID, {
    action: 'MESSAGE_DELETE',
    message: message as Message,
    oldContent: message.content
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
  await ctx.reply('You cannot run this command.', true)
}
