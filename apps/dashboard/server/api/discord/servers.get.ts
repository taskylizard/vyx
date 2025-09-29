import type { Guild } from 'oceanic.js'
import {
  fetchUserAdminGuilds,
  requireAuthenticatedUser
} from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event)
  const userAdminGuilds = await fetchUserAdminGuilds(session, event)

  try {
    const bot = event.context.bot
    if (!bot || !bot.ready) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Bot not available'
      })
    }

    // Filter bot guilds to only include those where user has admin permissions
    const guilds = Array.from(bot.guilds.values())
      .filter((guild) => userAdminGuilds.includes((guild as Guild).id))
      .map((guild) => ({
        id: (guild as Guild).id,
        name: (guild as Guild).name,
        icon: (guild as Guild).icon,
        permissions: '32', // Since we already verified admin permissions
        owner: false // We don't need to check ownership since we have admin permissions
      }))

    return { guilds }
  } catch (error) {
    event.context.logger.error('Error fetching Discord servers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch Discord servers'
    })
  }
})
