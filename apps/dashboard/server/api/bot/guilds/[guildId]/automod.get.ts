import {
  fetchUserAdminGuilds,
  requireAuthenticatedUser,
  validateGuildAccess
} from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event)
  const userAdminGuilds = await fetchUserAdminGuilds(session, event)
  const logger = event.context.logger
  const guildId = getRouterParam(event, 'guildId')

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Guild ID is required'
    })
  }

  validateGuildAccess(guildId, userAdminGuilds)

  try {
    const bot = event.context.bot
    if (!bot) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Bot is not available'
      })
    }

    const rules = await bot.prisma.automodRule.findMany({
      where: {
        guildId: BigInt(guildId)
      },
      orderBy: {
        id: 'asc'
      }
    })

    return {
      data: rules.map((rule) => ({
        id: rule.id,
        guildId: rule.guildId.toString(),
        type: rule.type,
        pattern: rule.pattern,
        enabled: rule.enabled,
        createdBy: rule.createdBy.toString(),
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString()
      }))
    }
  } catch (error) {
    logger.error('Error fetching automod rules:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch automod rules'
    })
  }
})
