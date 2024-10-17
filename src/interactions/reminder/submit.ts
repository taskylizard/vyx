import { ComponentTypes, TextInputStyles } from 'oceanic.js'
import { defineInteraction } from '#framework'

export default defineInteraction({
  id: 'action.snooze.submit',
  type: 'button',
  async run(interaction, client) {
    const reminder = await client.prisma.reminder.findUnique({
      where: {
        reminderMessageId: interaction.message.id
      }
    })

    if (!reminder) return

    await interaction.createModal({
      customID: `action.snooze.resolve-${reminder.id}`,
      title: 'Reschedule this reminder?',
      components: [
        {
          type: ComponentTypes.ACTION_ROW,
          components: [
            {
              type: ComponentTypes.TEXT_INPUT,
              customID: 'duration',
              label: 'Duration',
              style: TextInputStyles.SHORT,
              maxLength: 20,
              placeholder: '5m',
              required: true
            }
          ]
        }
      ]
    })
  }
})
