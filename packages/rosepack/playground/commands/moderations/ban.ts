import { defineCommand } from '../../../src'

export default defineCommand(
  {
    description: 'Ban a user from the server',
    options: {
      user: {
        type: 'User',
        description: 'The user to ban'
      },
      reason: {
        type: 'String',
        description: 'The reason for the ban',
        required: false
      }
    },
    userPermissions: ['ADMINISTRATOR']
  },
  async (interaction, ctx) => {
    const { user, reason } = ctx.options

    interaction.reply({ content: `Banned user ${user.username} for ${reason}` })
  }
)
