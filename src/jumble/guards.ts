import { guard } from '../bot/rosepack.ts'
import { guildOnlyGuard } from '../discord/guards.ts'
import { modules } from '../modules.ts'
import { jumblePermissionError } from './permissions.ts'

const disabledMessage = 'Jumble is disabled here. Ask the bot owner to use `/modules enable`.'

export const jumbleEnabledGuard = guard(async ({ app, interaction }) => {
  if (interaction.guildID === null) return guard.deny(disabledMessage)

  const enabled = await app.moduleStore.isEnabled({
    applicationID: interaction.applicationID,
    guildID: interaction.guildID,
    module: modules.jumble.id
  })
  return enabled ? guard.allow() : guard.deny(disabledMessage)
})

export const jumbleChannelPermissionsGuard = guard(({ interaction }) => {
  const message = jumblePermissionError(interaction)
  return message === null ? guard.allow() : guard.deny(message)
})

export const jumblePlayGuards = [guildOnlyGuard, jumbleChannelPermissionsGuard] as const
export const jumbleComponentGuards = [guildOnlyGuard, jumbleEnabledGuard] as const
export const jumbleStartGuards = [...jumbleComponentGuards, jumbleChannelPermissionsGuard] as const
