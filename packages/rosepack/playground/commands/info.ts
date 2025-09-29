import { defineCommand, useActionRow, useButtons } from '../../src'

export default defineCommand(
  {
    description: 'Get information about a user or the server',
    options: {
      user: {
        type: 'SubCommand',
        description: 'Get information about a user'
      },
      server: {
        type: 'SubCommand',
        description: 'Get information about the server'
      }
    }
  },
  (interaction, ctx) => {
    const { user, server } = ctx.options
    const { hello } = useButtons()
    const row = useActionRow(hello)
      .toJSON()
    if (user) {
      return interaction.reply({ content: 'User info', components: [row] })
    } else if (server) {
      return interaction.reply({ content: 'Server info', components: [row] })
    }
  }
)
