import type { Permission } from 'oceanic.js'

export function jumblePermissionError(interaction: {
  guildID: string | null
  appPermissions: Pick<Permission, 'has'>
}): string | null {
  if (interaction.guildID === null) return null

  const missing: string[] = []
  if (!interaction.appPermissions.has('VIEW_CHANNEL')) missing.push('View Channel')
  if (
    !interaction.appPermissions.has('SEND_MESSAGES') &&
    !interaction.appPermissions.has('SEND_MESSAGES_IN_THREADS')
  ) {
    missing.push('Send Messages')
  }
  if (!interaction.appPermissions.has('READ_MESSAGE_HISTORY')) missing.push('Read Message History')
  if (!interaction.appPermissions.has('ADD_REACTIONS')) missing.push('Add Reactions')
  if (!interaction.appPermissions.has('ATTACH_FILES')) missing.push('Attach Files')
  if (missing.length === 0) return null

  return [
    `I need **${missing.join(', ')}** in this channel to start Jumble.`,
    '-# Ask a server admin to update my channel permissions.'
  ].join('\n')
}
