import { defineCommand, useRosepack } from '../../../src'

export default defineCommand(
  {
    description: 'Pong!'
  },
  (interaction) => {
    interaction.reply(`Pong !`)
  }
)
