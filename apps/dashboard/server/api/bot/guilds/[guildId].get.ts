import { requireAuthenticatedUser, fetchUserAdminGuilds, validateGuildAccess } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await requireAuthenticatedUser(event)
  const userAdminGuilds = await fetchUserAdminGuilds(session, event)
  
  const bot = event.context.bot;
  const guildId = getRouterParam(event, "guildId");

  if (!bot || !bot.ready) {
    throw createError({
      statusCode: 503,
      statusMessage: "Bot not available",
    });
  }

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Guild ID required",
    });
  }

  // Validate user has admin permissions for this guild
  validateGuildAccess(guildId, userAdminGuilds)

  const guild = bot.guilds.get(guildId);

  if (!guild) {
    throw createError({
      statusCode: 404,
      statusMessage: "Guild not found",
    });
  }

  // Get basic guild info
  const guildInfo = {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    banner: guild.banner,
    description: guild.description,
    memberCount: guild.memberCount,
    ownerId: guild.ownerID,
    features: guild.features,
    roles: guild.roles.size,
    channels: guild.channels.size,
    emojis: guild.emojis.size,
  };

  return { guild: guildInfo };
});
