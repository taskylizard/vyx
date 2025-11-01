/** @jsx h */
import { defineInteraction } from '#framework'
import { ModalLabel, TextInput } from '@packages/components-jsx'
import { h } from '@packages/components-jsx/jsx-runtime'
import { TextInputStyles } from 'oceanic.js'

export default defineInteraction({
  id: 'ai.tasks.create',
  type: 'button',
  async run(interaction, _client) {
    await interaction.createModal({
      title: 'Create New AI Task',
      customID: 'ai.tasks.create.submit',
      components: [
        <ModalLabel
          label='Instructions'
          description='What should the AI do?'
        >
          <TextInput
            style={TextInputStyles.PARAGRAPH}
            customID='instructions'
            placeholder='Enter instructions...'
            required
          />
        </ModalLabel>,

        <ModalLabel label='Interval' description='How often (1-7 days)'>
          <TextInput
            style={TextInputStyles.SHORT}
            customID='interval'
            placeholder='1-7'
            required
          />
        </ModalLabel>,

        <ModalLabel label='Time' description='When to run (HH:MM format)'>
          <TextInput
            style={TextInputStyles.SHORT}
            customID='time'
            placeholder='HH:MM'
            required
          />
        </ModalLabel>,

        <ModalLabel label='Timezone' description='Your timezone (optional)'>
          <TextInput
            style={TextInputStyles.SHORT}
            customID='timezone'
            placeholder='e.g. America/New_York'
            required={false}
          />
        </ModalLabel>
      ]
    })
  }
})
