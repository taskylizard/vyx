import { Client } from 'oceanic.js'
import { logger } from './framework/utils/logger'

const token = process.env.DISCORD_TOKEN
if (!token) {
  logger.error('DISCORD_TOKEN not found in environment')
  process.exit(1)
}

const client = new Client({
  auth: `Bot ${token}`,
  gateway: {
    intents: ['ALL'] // No intents needed for clearing commands
  }
})

client.once('ready', async () => {
  try {
    logger.info('Clearing all application commands...')

    // Clear global commands
    await client.application.bulkEditGlobalCommands([])
    logger.info('Cleared global commands')

    // Clear commands in all guilds the bot is in
    const guildList = [...client.guilds.values()]

    for (const guild of guildList) {
      await client.application.bulkEditGuildCommands(guild.id, [])
      logger.info(`Cleared commands in guild ${guild.name} (${guild.id})`)
    }

    logger.info('All application commands have been cleared successfully.')
    process.exit(0)
  } catch (error) {
    logger.error('Failed to clear application commands:', error)
    process.exit(1)
  }
})

client.connect()
