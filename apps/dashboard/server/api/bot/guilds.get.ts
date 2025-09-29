import type { Guild } from 'oceanic.js'
import {
  fetchUserAdminGuilds,
  filterGuildsByUserPermissions,
  requireAuthenticatedUser
} from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event)
  const userAdminGuilds = await fetchUserAdminGuilds(session, event)

  const bot = event.context.bot

  if (!bot || !bot.ready) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bot not available'
    })
  }

  const allGuilds = Array.from(bot.guilds.values()).map((guild) => ({
    id: (guild as Guild).id,
    name: (guild as Guild).name,
    icon: (guild as Guild).icon,
    memberCount: (guild as Guild).memberCount,
    ownerId: (guild as Guild).ownerID,
    features: (guild as Guild).features
  }))

  const guilds = filterGuildsByUserPermissions(allGuilds, userAdminGuilds)

  return { guilds }
})
