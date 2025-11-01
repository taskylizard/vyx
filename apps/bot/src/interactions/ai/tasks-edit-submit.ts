import { defineInteraction, Embed } from '#framework'

export default defineInteraction({
  id: 'ai.tasks.edit.submit',
  type: 'modal',
  async run(interaction, client) {
    await interaction.deferUpdate()

    const customID = interaction.data.customID
    const taskId = Number.parseInt(customID.split('.').pop() || '0')

    if (Number.isNaN(taskId)) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Invalid task ID.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    const instructions = interaction.data.components.getTextInput(
      'instructions',
      false
    )
    const intervalStr = interaction.data.components.getTextInput(
      'interval',
      false
    )
    const time = interaction.data.components.getTextInput('time', false)
    const timezone = interaction.data.components.getTextInput('timezone', false)

    if (!instructions && !intervalStr && !time && timezone === null) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Please provide at least one field to update.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    if (time && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription(
          'Invalid time format. Please use HH:MM format (e.g., "09:00", "14:30").'
        )

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

    const updateData: any = {}
    if (instructions) updateData.instructions = instructions
    if (intervalStr) {
      const interval = Number.parseInt(intervalStr)
      if (interval < 1 || interval > 7) {
        const embed = new Embed()
          .setTitle('❌ Error')
          .setDescription('Interval must be between 1 and 7 days.')

        return await interaction.editOriginal({
          embeds: [embed],
          components: []
        })
      }
      updateData.intervalDays = interval
    }
    if (time) updateData.timeOfDay = time
    if (timezone !== null) updateData.timezone = timezone

    const updatedTask = await client.prisma.aITask.update({
      where: {
        id: taskId
      },
      data: updateData
    })

    if (updatedTask.isActive && (intervalStr || time || timezone !== null)) {
      await client.modules.scheduler.unscheduleAITask(taskId)
      await client.modules.scheduler.scheduleAITask(taskId)
    }

    const changes = []
    if (instructions) changes.push('Instructions updated')
    if (intervalStr) {
      const interval = Number.parseInt(intervalStr)
      changes.push(
        `Interval changed to ${
          interval === 1 ? 'daily' : `every ${interval} days`
        }`
      )
    }
    if (time) changes.push(`Time changed to ${time}`)
    if (timezone !== null) {
      changes.push(`Timezone ${timezone ? `set to ${timezone}` : 'removed'}`)
    }

    const embed = new Embed()
      .setTitle('✅ Task Updated Successfully')
      .setDescription(
        `**Changes:** ${changes.join(', ')}\n\n` +
          `The task schedule has been updated accordingly.`
      )

    return await interaction.editOriginal({
      embeds: [embed],
      components: []
    })
  }
})
