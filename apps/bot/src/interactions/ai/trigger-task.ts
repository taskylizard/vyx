import { defineInteraction, Embed } from '#framework'

export default defineInteraction({
  id: 'ai.task.trigger',
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

    const aiTask = await client.prisma.aITask.findFirst({
      where: {
        id: taskId,
        userId: interaction.user.id
      }
    })

    if (!aiTask) {
      const embed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Task not found or does not belong to you.')

      return await interaction.editOriginal({
        embeds: [embed],
        components: []
      })
    }

    const initialEmbed = new Embed()
      .setTitle('🚀 Triggering Task')
      .setDescription(
        `Triggering task **${taskId}** immediately for testing...\n\n**Instructions:** ${
          aiTask.instructions.length > 100
            ? aiTask.instructions.substring(0, 100) + '...'
            : aiTask.instructions
        }`
      )

    await interaction.editOriginal({
      embeds: [initialEmbed],
      components: []
    })

    try {
      await client.modules.scheduler.scheduleAITask(taskId, 1000)

      const successEmbed = new Embed()
        .setTitle('✅ Task Queued')
        .setDescription('Task has been queued and will execute shortly.')

      await interaction.editOriginal({
        embeds: [successEmbed],
        components: []
      })
    } catch (error) {
      client.logger.error('failed to trigger ai task', error)

      const errorEmbed = new Embed()
        .setTitle('❌ Error')
        .setDescription('Failed to trigger the task. Please try again.')

      await interaction.editOriginal({
        embeds: [errorEmbed],
        components: []
      })
    }
  }
})
