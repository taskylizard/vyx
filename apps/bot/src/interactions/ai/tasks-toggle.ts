import { defineInteraction, Embed } from '#framework'

export default defineInteraction({
  id: 'ai.tasks.toggle.select',
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

    const newStatus = !task.isActive

    if (newStatus) {
      const activeTasks = await client.prisma.aITask.count({
        where: {
          userId: interaction.user.id,
          isActive: true
        }
      })

      if (activeTasks >= 3) {
        const embed = new Embed()
          .setTitle('❌ Error')
          .setDescription(
            'You can only have a maximum of 3 active AI tasks. Please deactivate another task first.'
          )

        return await interaction.editOriginal({
          embeds: [embed],
          components: []
        })
      }
    }

    const updatedTask = await client.prisma.aITask.update({
      where: {
        id: taskId
      },
      data: {
        isActive: newStatus
      }
    })

    if (newStatus) {
      await client.modules.scheduler.scheduleAITask(taskId)
    } else {
      await client.modules.scheduler.unscheduleAITask(taskId)
    }

    const statusText = newStatus ? 'enabled' : 'disabled'

    const embed = new Embed()
      .setTitle('✅ Task Updated')
      .setDescription(
        `AI task **${taskId}** has been **${statusText}**.\n\n` +
          `**Task:** ${
            updatedTask.instructions.length > 100
              ? updatedTask.instructions.substring(0, 100) + '...'
              : updatedTask.instructions
          }`
      )

    return await interaction.editOriginal({
      embeds: [embed],
      components: []
    })
  }
})
