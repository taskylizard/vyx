import { defineInteraction, Embed } from '#framework'
import {
  ComponentMessage,
  Container,
  TextDisplay,
  TextInput
} from '@packages/components-jsx'
import { createMessage } from './shared'

export default defineInteraction({
  id: 'ai.tasks.create.submit',
  type: 'modal',
  async run(interaction, client) {
    await interaction.deferUpdate()

    const instructions = interaction.data.components.getTextInput(
      'instructions',
      true
    )
    const intervalStr = interaction.data.components.getTextInput(
      'interval',
      true
    )
    const time = interaction.data.components.getTextInput('time', true)
    const timezone = interaction.data.components.getTextInput(
      'timezone',
      false
    )

    if (!instructions || !intervalStr || !time) {
      return await interaction.editOriginal(
        createMessage(
          <TextDisplay>
            Please fill out all required fields before submitting.
          </TextDisplay>
        )
      )
    }

    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      return await interaction.editOriginal(
        createMessage(
          <TextDisplay>
            Invalid time format. Please use HH:MM format (e.g., "09:00",
            "14:30").
          </TextDisplay>
        )
      )
    }

    const interval = Number.parseInt(intervalStr)
    if (interval < 1 || interval > 7) {
      return await interaction.editOriginal(
        createMessage(
          <TextDisplay>Interval must be between 1 and 7 days.</TextDisplay>
        )
      )
    }

    const existingTasks = await client.prisma.aITask.count({
      where: {
        userId: interaction.user.id,
        isActive: true
      }
    })

    if (existingTasks >= 3) {
      return await interaction.editOriginal(
        createMessage(
          <TextDisplay>
            You can only have a maximum of 3 active AI tasks. Please delete or
            deactivate an existing task first.
          </TextDisplay>
        )
      )
    }

    const aiTask = await client.prisma.aITask.create({
      data: {
        userId: interaction.user.id,
        instructions,
        intervalDays: interval,
        timeOfDay: time,
        timezone,
        isActive: true
      }
    })

    await client.modules.scheduler.scheduleAITask(aiTask.id)

    const timezoneText = timezone ? ` in ${timezone}` : ''
    const intervalText = interval === 1 ? 'daily' : `every ${interval} days`

    return await interaction.editOriginal(
      createMessage(
        <TextDisplay>
          **Instructions:** {instructions}
          <></>
          **Schedule:** {intervalText} at {time}
          {timezoneText}
          <></>
          **Task ID:** {aiTask.id}
          <></>
          Your first task will run at the next scheduled time.
        </TextDisplay>
      )
    )
  }
})
