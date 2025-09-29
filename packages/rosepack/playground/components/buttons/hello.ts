import { ButtonStyles } from 'oceanic.js'
import { defineButton } from '../../../src'

export default defineButton(
  {
    label: 'Say hello!',
    style: ButtonStyles.PRIMARY
  },
  (interaction) => {
    interaction.reply({
      content: 'Hello, world!'
    })
  }
)
