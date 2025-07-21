export default defineEventHandler(async (event) => {
  const bot = event.context.bot
  
  if (!bot) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bot not available'
    })
  }

  // Check if bot is ready
  if (!bot.ready) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bot not ready'
    })
  }

  return {
    status: 'connected',
    username: bot.user?.username,
    id: bot.user?.id,
    guilds: bot.guilds.size,
    uptime: bot.uptime,
    ready: bot.ready
  }
})