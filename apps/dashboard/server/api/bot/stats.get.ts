export default defineEventHandler(async (event) => {
  const bot = event.context.bot
  const logger = event.context.logger
  if (!bot || !bot.ready) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bot not available'
    })
  }

  try {
    const userCount = await bot.getUsersCount()

    return {
      totalUsers: userCount,
      totalGuilds: bot.guilds.size,
      uptime: bot.uptime,
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      botVersion: bot.user?.discriminator || 'N/A'
    }
  } catch (error) {
    logger.error('Error fetching bot stats:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch bot statistics'
    })
  }
})
