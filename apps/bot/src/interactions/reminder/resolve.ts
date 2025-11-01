import { defineInteraction } from '#framework'
import parse from 'parse-duration'
import { parseReschedulingIntent } from '../../services/ai-reminder'

export default defineInteraction({
  id: 'action.snooze.resolve',
  type: 'modal',
  async run(interaction, client) {
    if (!interaction.isModalSubmitInteraction()) return
    await interaction.defer(64)
    const duration = interaction.data.components.getTextInput('duration', true)
    const reminderId = interaction.data.customID.split('-')[1]?.trim() ?? ''

    const reminder = await client.prisma.reminder.findUnique({
      where: {
        reminderMessageId: interaction.message!.id
      }
    })

    if (!reminder) return

    // First try AI-powered natural language parsing
    const userInfo = {
      userId: interaction.user.id,
      guildId: interaction.guildID ?? undefined,
      username: interaction.user.username,
      guildName: interaction.guild?.name ?? undefined
    }

    const aiParsed = await parseReschedulingIntent(
      duration,
      reminder.content,
      userInfo
    )

    if (aiParsed) {
      // Use AI-parsed delay and message
      const time = new Date(Date.now() + aiParsed.delay)
      await client.modules.scheduler.reminder.add(
        'reminder',
        { id: Number(reminderId) },
        { delay: aiParsed.delay }
      )

      return await interaction.editOriginal({
        content: `${aiParsed.message} I'll re-remind you in <t:${
          Math.trunc(time.getTime() / 1000)
        }:R> to \`${reminder.content}\`.`
      })
    }

    // Fallback to traditional parsing if AI fails
    const delay = parse(duration)
    if (typeof delay !== 'number') {
      return await interaction.editOriginal({
        content: "I couldn't understand that timing. Try something like:\n" +
          '• "in 30 minutes" or "30m"\n' +
          '• "tomorrow" or "1 day"\n' +
          '• "not now" (defaults to 1 hour)\n' +
          '• "next week" or "7 days"\n\n' +
          'Or use precise formats like `1h30m25s`.'
      })
    }

    const time = new Date(Date.now() + delay)
    await client.modules.scheduler.reminder.add(
      'reminder',
      { id: Number(reminderId) },
      { delay }
    )

    return await interaction.editOriginal({
      content: `Alright ${interaction.user.mention}, I'll re-remind you in <t:${
        Math.trunc(
          time.getTime() / 1000
        )
      }:R> to \`${reminder.content}\`.`
    })
  }
})
