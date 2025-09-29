import { TextInputStyles } from 'oceanic.js'
import { defineModal } from '../../../src'

export default defineModal(
  {
    title: 'Form',
    inputs: {
      color: {
        label: 'Favorite color',
        style: TextInputStyles.SHORT,
        placeholder: 'Enter your favorite color'
      },
      hobbies: {
        label: 'Hobbies',
        style: TextInputStyles.PARAGRAPH,
        placeholder: 'Enter your hobbies',
        required: false
      }
    }
  },
  (interaction, ctx) => {
    const { color } = ctx.inputs

    interaction.reply({ content: `Submitted color: ${color}` })
  }
)
