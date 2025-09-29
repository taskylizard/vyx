import { prisma } from '@packages/database'
import env from '@packages/env'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { admin, createAuthMiddleware } from 'better-auth/plugins'
import type { RawGuild } from 'oceanic.js'
import { getBotInstance } from '../plugins/bot'
import { logger } from '../utils/utils'

async function getUserGuilds(token: string): Promise<RawGuild[]> {
  try {
    const response = await fetch(
      'https://discord.com/api/v10/users/@me/guilds',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    logger.error('Error fetching user guilds:', error)
    return []
  }
}

function hasAdminPermissions(permissions: string): boolean {
  const permissionBit = BigInt(permissions)
  const ADMINISTRATOR = BigInt(0x8)
  const MANAGE_GUILD = BigInt(0x20)

  return (
    (permissionBit & ADMINISTRATOR) !== BigInt(0) ||
    (permissionBit & MANAGE_GUILD) !== BigInt(0)
  )
}

export async function getUserAdminGuilds(
  token: string,
  botGuildIds: string[]
): Promise<string[]> {
  const userGuilds = await getUserGuilds(token)

  return userGuilds
    .filter(
      (guild) =>
        botGuildIds.includes(guild.id) &&
        (guild.owner ||
          (guild.permissions && hasAdminPermissions(guild.permissions)))
    )
    .map((guild) => guild.id)
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24 // 1 day
  },
  socialProviders: {
    discord: {
      clientId: env.DISCORD_OAUTH_CLIENT_ID,
      clientSecret: env.DISCORD_OAUTH_CLIENT_SECRET,
      scope: ['identify', 'guilds'],
      disableDefaultScope: true,
      mapProfileToUser: (profile) => {
        return {
          username: profile.username,
          displayName: profile.global_name,
          userId: profile.id
        }
      }
    }
  },
  baseURL: getBaseURL(),
  emailAndPassword: {
    enabled: false
  },
  plugins: [admin()],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession
      if (newSession) {
        try {
          const accessToken = await auth.api.getAccessToken({
            body: {
              providerId: 'discord',
              userId: newSession.user.id
            },
            headers: ctx.headers
          })

          if (!accessToken.accessToken) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Failed to get Discord access token'
            })
          }

          const bot = getBotInstance()

          if (!bot || !bot.ready) {
            throw new APIError('SERVICE_UNAVAILABLE', {
              message: 'Bot service is not available'
            })
          }

          const botGuildIds = Array.from(bot.guilds.keys())
          const userAdminGuilds = await getUserAdminGuilds(
            accessToken.accessToken,
            botGuildIds
          )

          if (userAdminGuilds.length === 0) {
            throw new APIError('UNAUTHORIZED', {
              message:
                'You must have admin permissions in at least one server that the bot is in.'
            })
          }

          // logger.info(
          //   `User ${newSession.user.username} has admin access to guilds:`,
          //   userAdminGuilds,
          // );

          // Redirect after successful processing - no caching needed for private bot
          throw ctx.redirect('/')
        } catch (error) {
          if (error instanceof APIError) {
            throw error
          }

          // Re-throw any redirect responses from ctx.redirect()
          if (error && typeof error === 'object') {
            throw error
          }

          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Authentication failed'
          })
        }
      }
    })
  }
})

function getBaseURL() {
  let baseURL = env.BETTER_AUTH_URL
  if (!baseURL) {
    try {
      if (import.meta.dev && process.env.OAUTH_PROXY) {
        baseURL = process.env.OAUTH_PROXY
      } else {
        baseURL = getRequestURL(useEvent()).origin
      }
    } catch (e) {}
  }

  return baseURL
}
