import parse from 'parse-duration'
import { defineInteraction } from '#framework'

export default defineInteraction({
  id: 'action.snooze.resolve',
  type: 'modal',
  async run(interaction, client) {
    if (!interaction.isModalSubmitInteraction()) return
    await interaction.defer(64)
    const duration = interaction.data.components.getTextInput('duration', true)
    const reminderId = interaction.data.customID.split('-')[1].trim()

    const reminder = await client.prisma.reminder.findUnique({
      where: {
        reminderMessageId: interaction.message!.id
      }
    })

    if (!reminder) return

    const delay = parse(duration)
    if (typeof delay !== 'number') {
      return await interaction.editOriginal({
        content:
          'The time you input is invalid! The format must be a human readable string, i.e: `1h30m25s`.'
      })
    }

    const time = new Date(Date.now() + delay)
    await client.modules.scheduler.reminder.add(
      'reminder',
      { id: Number(reminderId) },
      { delay }
    )

    return await interaction.editOriginal({
      content: `Alright ${interaction.user.mention}, I'll re-remind you in <t:${Math.trunc(
        time.getTime() / 1000
      )}:R> to \`${reminder.content}\`.`
    })
  }
})
