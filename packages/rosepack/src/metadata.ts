import { ApplicationIntegrationTypes, InteractionContextTypes } from 'oceanic.js'

/** Places where Discord allows an application command to be used. */
export type SlashCommandContextName = 'botDm' | 'guild' | 'privateChannel'

/** Installation types through which a Discord application command is available. */
export type SlashCommandInstallation = 'guild' | 'user'

export const interactionContextTypeByName = {
  botDm: InteractionContextTypes.BOT_DM,
  guild: InteractionContextTypes.GUILD,
  privateChannel: InteractionContextTypes.PRIVATE_CHANNEL
} as const satisfies Record<SlashCommandContextName, InteractionContextTypes>

export const integrationTypeByInstallation = {
  guild: ApplicationIntegrationTypes.GUILD_INSTALL,
  user: ApplicationIntegrationTypes.USER_INSTALL
} as const satisfies Record<SlashCommandInstallation, ApplicationIntegrationTypes>
