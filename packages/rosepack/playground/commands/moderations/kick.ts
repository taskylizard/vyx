import { defineCommand } from '../../../src'

export default defineCommand(
  {
    description: 'Kick a user from the server',
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
    }
  },
  (interaction, context) => {
    const { user, reason } = context.options

    interaction.reply({ content: `Kicked user ${user.username} for ${reason}` })
  }
)
