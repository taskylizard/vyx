import type { AutomodRuleType } from '@packages/database'
import { invalidateAutomodCache } from '../../../../../../../bot/src/automod'
import {
  fetchUserAdminGuilds,
  requireAuthenticatedUser,
  validateGuildAccess
} from '../../../../../utils/session'

interface UpdateAutomodRuleBody {
  enabled?: boolean
  pattern?: string
  type?: AutomodRuleType
}

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

  const body = await readBody<UpdateAutomodRuleBody>(event)
  const updates: {
    enabled?: boolean
    pattern?: string
    type?: AutomodRuleType
  } = {}

  if (body.enabled !== undefined) {
    updates.enabled = body.enabled
  }

  if (body.pattern !== undefined) {
    if (typeof body.pattern !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pattern must be a string'
      })
    }

    const trimmed = body.pattern.trim()
    if (!trimmed) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pattern cannot be empty'
      })
    }
    if (trimmed.length > 200) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pattern is too long'
      })
    }
    updates.pattern = trimmed
  }

  if (body.type !== undefined) {
    if (!['WORD', 'REGEX'].includes(body.type)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid automod rule type'
      })
    }
    updates.type = body.type
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid updates provided'
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

    const rule = await bot.prisma.automodRule.findUnique({
      where: { id: ruleId }
    })

    if (!rule || rule.guildId.toString() !== guildId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Automod rule not found'
      })
    }

    if (updates.pattern || updates.type) {
      const patternToCheck = updates.pattern || rule.pattern
      const typeToCheck = updates.type || rule.type

      const conflict = await bot.prisma.automodRule.findFirst({
        where: {
          guildId: rule.guildId,
          pattern: patternToCheck,
          type: typeToCheck,
          NOT: {
            id: ruleId
          }
        }
      })

      if (conflict) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Another rule already uses this pattern and type'
        })
      }
    }

    const updated = await bot.prisma.automodRule.update({
      where: { id: ruleId },
      data: updates
    })

    invalidateAutomodCache(guildId)

    return {
      data: {
        id: updated.id,
        guildId: updated.guildId.toString(),
        type: updated.type,
        pattern: updated.pattern,
        enabled: updated.enabled,
        createdBy: updated.createdBy.toString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      }
    }
  } catch (error) {
    logger.error('Error updating automod rule:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update automod rule'
    })
  }
})
