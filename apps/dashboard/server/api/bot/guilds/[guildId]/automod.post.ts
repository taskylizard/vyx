import type { AutomodRuleType } from '@packages/database'
import { invalidateAutomodCache } from '../../../../../../bot/src/automod'
import {
  fetchUserAdminGuilds,
  requireAuthenticatedUser,
  validateGuildAccess
} from '../../../../utils/session'

interface CreateAutomodRuleBody {
  type: AutomodRuleType
  pattern: string
}

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

  const body = await readBody<CreateAutomodRuleBody>(event)
  const type = body.type
  const rawPattern = body.pattern?.trim()

  if (!type || !['WORD', 'REGEX'].includes(type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid automod rule type'
    })
  }

  if (!rawPattern) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pattern is required'
    })
  }

  if (rawPattern.length > 200) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pattern is too long'
    })
  }

  try {
    const bot = event.context.bot
    if (!bot) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Bot is not available'
      })
    }

    const guildKey = BigInt(guildId)

    const existing = await bot.prisma.automodRule.findFirst({
      where: {
        guildId: guildKey,
        type,
        pattern: rawPattern
      }
    })

    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An identical automod rule already exists'
      })
    }

    const created = await bot.prisma.automodRule.create({
      data: {
        guildId: guildKey,
        type,
        pattern: rawPattern,
        createdBy: BigInt(session.user.id)
      }
    })

    invalidateAutomodCache(guildId)

    return {
      data: {
        id: created.id,
        guildId: created.guildId.toString(),
        type: created.type,
        pattern: created.pattern,
        enabled: created.enabled,
        createdBy: created.createdBy.toString(),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString()
      }
    }
  } catch (error) {
    logger.error('Error creating automod rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create automod rule'
    })
  }
})
