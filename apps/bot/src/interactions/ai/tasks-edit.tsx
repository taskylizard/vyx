import { defineInteraction, Embed } from '#framework'
import { ModalLabel, TextInput } from '@packages/components-jsx'
import { h } from '@packages/components-jsx/jsx-runtime'
import { TextInputStyles } from 'oceanic.js'

export default defineInteraction({
  id: 'ai.tasks.edit.select',
  type: 'selectMenu',
  async run(interaction, client) {
    await interaction.deferUpdate()

    const selectedValue = interaction.data.values.getStrings()[0]
    if (!selectedValue) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('No task selected.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    const taskId = Number.parseInt(selectedValue)

    if (Number.isNaN(taskId)) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Invalid task ID selected.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    const task = await client.prisma.aITask.findFirst({
      where: {
        id: taskId,
        userId: interaction.user.id
      }
    })

    if (!task) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Task not found or does not belong to you.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    await interaction.createModal({
      title: `Edit Task ${taskId}`,
      customID: `ai.tasks.edit.submit.${taskId}`,
      components: (
        <>
          <ModalLabel label='Instructions' description='What should the AI do?'>
            <TextInput
              style={TextInputStyles.PARAGRAPH}
              customID='instructions'
              placeholder={task.instructions}
              required={false}
            />
          </ModalLabel>

          <ModalLabel label='Interval' description='How often (1-7 days)'>
            <TextInput
              style={TextInputStyles.SHORT}
              customID='interval'
              placeholder={task.intervalDays.toString()}
              required={false}
            />
          </ModalLabel>

          <ModalLabel label='Time' description='When to run (HH:MM)'>
            <TextInput
              style={TextInputStyles.SHORT}
              customID='time'
              placeholder={task.timeOfDay}
              required={false}
            />
          </ModalLabel>

          <ModalLabel label='Timezone' description='Your timezone (optional)'>
            <TextInput
              style={TextInputStyles.SHORT}
              customID='timezone'
              placeholder={task.timezone || 'e.g. America/New_York'}
              required={false}
            />
          </ModalLabel>
        </>
      )
    })
  }
})
