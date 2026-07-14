import { slashCommand, subcommand } from '../framework.ts'

export default slashCommand({
  name: 'admin',
  description: 'Inspect server administration information',
  contexts: ['guild'],
  installations: ['guild'],

  subcommands: {
    server: {
      description: 'Server-level actions',

      subcommands: {
        inspect: subcommand({
          description: 'Inspect the current server',

          async execute(context) {
            const { guildID, memberPermissions } = context.interaction
            await context.reply(
              `Server ${guildID}; can manage: ${memberPermissions?.has('MANAGE_GUILD') === true}`
            )
          }
        })
      }
    }
  }
})
