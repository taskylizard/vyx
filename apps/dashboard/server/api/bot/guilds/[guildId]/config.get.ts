export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event);
  const userAdminGuilds = await fetchUserAdminGuilds(session, event);
  const logger = event.context.logger;
  const guildId = getRouterParam(event, "guildId");

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Guild ID is required",
    });
  }

  // Validate user has admin permissions for this guild
  validateGuildAccess(guildId, userAdminGuilds);

  try {
    // Get bot instance and database connection
    const bot = event.context.bot;
    if (!bot) {
      throw createError({
        statusCode: 503,
        statusMessage: "Bot is not available",
      });
    }

    const config = await bot.prisma.config.findUnique({
      where: { guildId: BigInt(guildId) },
    });

    return {
      data: config
        ? {
          guildId: config.guildId.toString(),
          modules: config.modules,
          reportsChannel: config.reportsChannel?.toString() || null,
          currency: config.currency || "🍣",
        }
        : null,
    };
  } catch (error) {
    logger.error("Error fetching guild config:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch guild configuration",
    });
  }
});
