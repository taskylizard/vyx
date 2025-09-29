import { invalidateAutomodCache } from '../../../../../../../bot/src/automod'
import {
  fetchUserAdminGuilds,
  requireAuthenticatedUser,
  validateGuildAccess
} from '../../../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event)
  const userAdminGuilds = await fetchUserAdminGuilds(session, event)
  const logger = event.context.logger
  const guildId = getRouterParam(event, 'guildId')
  const ruleIdParam = getRouterParam(event, 'ruleId')

  if (!guildId || !ruleIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Guild ID and rule ID are required'
    })
  }

  const ruleId = Number(ruleIdParam)
  if (!Number.isInteger(ruleId) || ruleId < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid rule ID'
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

    const rule = await bot.prisma.automodRule.findUnique({
      where: { id: ruleId }
    })

    if (!rule || rule.guildId.toString() !== guildId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automod rule not found'
      })
    }

    await bot.prisma.automodRule.delete({
      where: { id: ruleId }
    })

    invalidateAutomodCache(guildId)

    return {
      data: {
        success: true
      }
    }
  } catch (error) {
    logger.error('Error deleting automod rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete automod rule'
    })
  }
})
