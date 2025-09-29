import type { SlashCommand } from '../../../../../../bot/src/framework'
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
  const body = await readBody(event)

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Guild ID is required'
    })
  }

  // Validate user has admin permissions for this guild
  validateGuildAccess(guildId, userAdminGuilds)

  try {
    const bot = event.context.bot
    if (!bot) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Bot is not available'
      })
    }

    const { action } = body

    switch (action) {
      case 'toggle_module': {
        const { module, enabled, channelId } = body

        if (!['REPORT', 'ECONOMY', 'MODERATION'].includes(module)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Invalid module'
          })
        }

        // Special handling for MODERATION module
        if (module === 'MODERATION' && enabled && !channelId) {
          throw createError({
            statusCode: 400,
            statusMessage:
              'Channel ID is required when enabling MODERATION module'
          })
        }

        const config = await bot.prisma.config.upsert({
          where: { guildId: BigInt(guildId) },
          update: {
            modules: enabled
              ? { push: module }
              : {
                set: await bot.prisma.config
                  .findUnique({
                    where: { guildId: BigInt(guildId) }
                  })
                  .then(
                    (c: any) =>
                      c?.modules.filter((m: string) => m !== module) || []
                  )
              },
            // Handle MODERATION module special settings
            ...(module === 'MODERATION' && enabled && {
              logsChannel: BigInt(channelId),
              logsEnabled: true,
              logModerationActions: true,
              logMessageEdits: true,
              logMessageDeletes: true
            }),
            ...(module === 'MODERATION' && !enabled && {
              logsEnabled: false,
              logModerationActions: false,
              logMessageEdits: false,
              logMessageDeletes: false,
              logsChannel: null
            })
          },
          create: {
            guildId: BigInt(guildId),
            currency: '🍣',
            modules: enabled ? [module] : [],
            // Handle MODERATION module special settings for creation
            ...(module === 'MODERATION' && enabled && {
              logsChannel: BigInt(channelId),
              logsEnabled: true,
              logModerationActions: true,
              logMessageEdits: true,
              logMessageDeletes: true
            })
          }
        })

        // Handle Discord command registration/removal
        const command = [
          ...bot.managers.interactions.handlers.commands.values()
        ].find((cmd: SlashCommand) => cmd.moduleId === module)

        if (command) {
          if (enabled) {
            await bot.application.createGuildCommand(
              guildId,
              bot.managers.interactions.toSlashJson(command) as any
            )
          } else {
            const guildCommands = await bot.application.getGuildCommands(
              guildId
            )
            const existingCommand = guildCommands.find(
              (cmd: any) => cmd.name === command.name
            )
            if (existingCommand) {
              await bot.application.deleteGuildCommand(
                guildId,
                existingCommand.id
              )
            }
          }
        }

        return {
          success: true,
          config: {
            ...config,
            guildId: config.guildId.toString(),
            reportsChannel: config.reportsChannel?.toString() || null,
            logsChannel: config.logsChannel?.toString() || null
          }
        }
      }

      case 'update_reports_channel': {
        const { channelId } = body
        const config = await bot.prisma.config.upsert({
          where: { guildId: BigInt(guildId) },
          update: {
            reportsChannel: channelId ? BigInt(channelId) : null
          },
          create: {
            guildId: BigInt(guildId),
            currency: '🍣',
            reportsChannel: channelId ? BigInt(channelId) : null,
            modules: []
          }
        })

        return {
          success: true,
          config: {
            ...config,
            guildId: config.guildId.toString(),
            reportsChannel: config.reportsChannel?.toString() || null,
            logsChannel: config.logsChannel?.toString() || null
          }
        }
      }

      case 'update_logging': {
        const {
          logsChannel,
          logModerationActions,
          logMessageEdits,
          logMessageDeletes
        } = body

        const config = await bot.prisma.config.upsert({
          where: { guildId: BigInt(guildId) },
          update: {
            ...(logsChannel !== undefined && {
              logsChannel: logsChannel ? BigInt(logsChannel) : null,
              logsEnabled: !!logsChannel
            }),
            ...(logModerationActions !== undefined && {
              logModerationActions
            }),
            ...(logMessageEdits !== undefined && {
              logMessageEdits
            }),
            ...(logMessageDeletes !== undefined && {
              logMessageDeletes
            })
          },
          create: {
            guildId: BigInt(guildId),
            currency: '🍣',
            modules: [],
            logsChannel: logsChannel ? BigInt(logsChannel) : null,
            logsEnabled: !!logsChannel,
            logModerationActions: logModerationActions || false,
            logMessageEdits: logMessageEdits || false,
            logMessageDeletes: logMessageDeletes || false
          }
        })

        return {
          success: true,
          config: {
            ...config,
            guildId: config.guildId.toString(),
            reportsChannel: config.reportsChannel?.toString() || null,
            logsChannel: config.logsChannel?.toString() || null
          }
        }
      }

      case 'update_currency': {
        const { currency } = body

        if (!currency || currency.length > 2) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Invalid currency format'
          })
        }

        const config = await bot.prisma.config.upsert({
          where: { guildId: BigInt(guildId) },
          update: { currency },
          create: {
            guildId: BigInt(guildId),
            currency,
            modules: []
          }
        })

        return {
          success: true,
          config: {
            ...config,
            guildId: config.guildId.toString(),
            reportsChannel: config.reportsChannel?.toString() || null,
            logsChannel: config.logsChannel?.toString() || null
          }
        }
      }

      default:
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid action'
        })
    }
  } catch (error) {
    logger.error('Error updating guild config:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update guild configuration'
    })
  }
})
