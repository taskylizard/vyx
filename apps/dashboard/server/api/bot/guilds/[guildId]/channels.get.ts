import type { AnyGuildChannelWithoutThreads } from 'oceanic.js'
import { requireAuthenticatedUser, fetchUserAdminGuilds, validateGuildAccess } from '../../../../utils/session'

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
    const bot = event.context.bot;
    if (!bot) {
      throw createError({
        statusCode: 503,
        statusMessage: "Bot is not available",
      });
    }

    // Get guild from bot
    const guild = bot.guilds.get(guildId);
    if (!guild) {
      throw createError({
        statusCode: 404,
        statusMessage: "Guild not found",
      });
    }

    // Fetch channels
    const channels = await guild.getChannels();

    return {
      data: channels.map((channel: AnyGuildChannelWithoutThreads) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentID || null,
      })),
    };
  } catch (error) {
    logger.error("Error fetching guild channels:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch guild channels",
    });
  }
});