import { defineInteraction, Embed } from '#framework'

export default defineInteraction({
  id: 'ai.tasks.delete.select',
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

    await client.modules.scheduler.unscheduleAITask(taskId)

    await client.prisma.aITask.delete({
      where: {
        id: taskId
      }
    })

    const embed = new Embed()
      .setTitle('🗑️ Task Deleted')
      .setDescription(
        `AI task **${taskId}** has been deleted successfully.\n\n` +
          `**Deleted task:** ${
            task.instructions.length > 100
              ? task.instructions.substring(0, 100) + '...'
              : task.instructions
          }`
      )

    return await interaction.editOriginal({
      embeds: [embed],
      components: []
    })
  }
})
