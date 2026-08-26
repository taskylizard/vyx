import type { KanikouEnv } from '../config/env.ts'
import type { SkyblockAdvisorConfig } from '../llm/tools/hypixel.ts'
import type { KanikouLogger } from '../observability/types.ts'
import { HypixelClient } from './client.ts'

export interface SkyblockFeature {
  /** Configured advisor scope plus identity handed to the tool provider. */
  advisor: SkyblockAdvisorConfig
  client: HypixelClient
}

/** The message surface the advisor route needs to decide ownership. */
export interface SkyblockAdvisorMessage {
  author: { id: string }
  channelID: string
  guildID: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Builds the single-user, single-channel Skyblock advisor when every required
 * variable is present. A partially configured setup disables the feature with
 * a warning instead of failing the whole bot.
 */
export function resolveSkyblockFeature(
  env: KanikouEnv,
  logger: Pick<KanikouLogger, 'warn'>
): SkyblockFeature | undefined {
  const apiKey = nonEmpty(env.HYPIXEL_API_KEY)
  const channelID = nonEmpty(env.SKYBLOCK_CHANNEL_ID)
  const userID = nonEmpty(env.SKYBLOCK_DISCORD_USER_ID)
  const playerUUID = nonEmpty(env.SKYBLOCK_PLAYER_UUID)
  const profileName = nonEmpty(env.SKYBLOCK_PROFILE_NAME)

  const fullyAbsent =
    apiKey === undefined &&
    channelID === undefined &&
    userID === undefined &&
    playerUUID === undefined
  if (fullyAbsent) return undefined

  const missing = [
    ['HYPIXEL_API_KEY', apiKey],
    ['SKYBLOCK_CHANNEL_ID', channelID],
    ['SKYBLOCK_DISCORD_USER_ID', userID]
  ]
    .filter((entry): entry is [string, undefined] => entry[1] === undefined)
    .map(([name]) => name)
  if (playerUUID === undefined || !UUID_PATTERN.test(playerUUID)) {
    missing.push('a valid SKYBLOCK_PLAYER_UUID')
  }

  if (
    apiKey === undefined ||
    channelID === undefined ||
    userID === undefined ||
    playerUUID === undefined ||
    !UUID_PATTERN.test(playerUUID)
  ) {
    logger.warn('skyblock advisor disabled: incomplete configuration', { missing })
    return undefined
  }

  return {
    advisor: {
      identity: { playerUUID, profileName },
      scope: { channelID, userID }
    },
    client: new HypixelClient({
      apiKey,
      onError: (error) => logger.warn('Hypixel API error', { error })
    })
  }
}

/** Whether an incoming guild message belongs to the advisor's exclusive scope. */
export function isSkyblockAdvisorTarget(env: KanikouEnv, message: SkyblockAdvisorMessage): boolean {
  return (
    message.guildID !== null &&
    nonEmpty(env.SKYBLOCK_CHANNEL_ID) === message.channelID &&
    nonEmpty(env.SKYBLOCK_DISCORD_USER_ID) === message.author.id
  )
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim().length === 0 ? undefined : value?.trim()
}
