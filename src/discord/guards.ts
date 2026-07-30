import { guard } from '../bot/rosepack.ts'
import { OWNER_USER_ID } from './ids.ts'

export const guildOnlyGuard = guard.guild({ message: 'Use this command in a server.' })

export const manageGuildGuard = guard.userPermissions('MANAGE_GUILD', {
  message: 'You need **Manage Server** to do that.'
})

export const botOwnerGuard = guard(({ interaction }) =>
  interaction.user.id === OWNER_USER_ID
    ? guard.allow()
    : guard.deny('Only the bot owner can use this.')
)
