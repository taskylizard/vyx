import type { H3Event } from 'h3'
import { getBotInstance } from '../plugins/bot'
import { auth, getUserAdminGuilds } from './auth'

export async function requireAuthenticatedUser(event: H3Event) {
  const session = await auth.api.getSession({
    headers: event.headers
  })

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  return session
}

export async function fetchUserAdminGuilds(
  session: any,
  event: H3Event
): Promise<string[]> {
  // Get fresh Discord access token
  const accessToken = await auth.api.getAccessToken({
    body: {
      providerId: 'discord',
      userId: session.user.id
    },
    headers: event.headers
  })

  if (!accessToken.accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No Discord access token found'
    })
  }

  const bot = getBotInstance()

  if (!bot || !bot.ready) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Bot service is not available'
    })
  }

  const botGuildIds: string[] = Array.from(bot.guilds.keys())
  const adminGuilds = await getUserAdminGuilds(
    accessToken.accessToken,
    botGuildIds
  )

  if (adminGuilds.length === 0) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No admin permissions found'
    })
  }

  return adminGuilds
}

export function filterGuildsByUserPermissions<T extends { id: string }>(
  guilds: T[],
  userAdminGuilds: string[]
): T[] {
  return guilds.filter((guild) => userAdminGuilds.includes(guild.id))
}

export function validateGuildAccess(
  guildId: string,
  userAdminGuilds: string[]
): void {
  if (!userAdminGuilds.includes(guildId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient permissions for this guild'
    })
  }
}
