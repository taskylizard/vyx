import { ActionRow, Button } from '@oceanicjs/builders'
import {
  formatAskAIAnswer,
  generateAITaskContent
} from '@packages/inference-engine'
import { type ConnectionOptions, Queue, Worker } from 'bullmq'
import { addDays } from 'date-fns'
import { format, fromZonedTime, toZonedTime } from 'date-fns-tz'
import { ButtonStyles, type MessageActionRow } from 'oceanic.js'
import type { Client } from '../client'
import { formatLongResponse } from '../utils/response-utils'

export class SchedulerModule {
  public reminder: Queue
  public reminderWorker: Worker
  public aiTask: Queue
  public aiTaskWorker: Worker

  public constructor(
    private client: Client
  ) {
    const connectionOptions: ConnectionOptions = {
      host: this.client.env.REDIS_HOST,
      port: Number(this.client.env.REDIS_PORT)
    }

    // Existing reminder queue
    this.reminder = new Queue('{reminder}', { connection: connectionOptions })
    this.reminderWorker = new Worker(
      '{reminder}',
      // biome-ignore lint/suspicious/useAwait: no idea lol
      async (job) => {
        if (job.name === 'reminder') {
          this.handleReminder(job.data.id)
        }
      },
      { connection: connectionOptions }
    )

    // New AI task queue
    this.aiTask = new Queue('{ai-task}', { connection: connectionOptions })
    this.aiTaskWorker = new Worker(
      '{ai-task}',
      async (job) => {
        if (job.name === 'ai-task') {
          await this.handleAITask(job.data.id)
        }
      },
      { connection: connectionOptions }
    )
  }

  private async handleReminder(id: number) {
    const reminder = await this.client.prisma.reminder.findUnique({
      where: {
        id: id
      }
    })

    if (!reminder) return

    const buttonRow = new ActionRow()
      .addComponents(
        new Button(ButtonStyles.LINK, reminder.messageLink).setLabel(
          'Go to original message'
        ),
        new Button(ButtonStyles.SECONDARY, 'action.snooze.submit')
          .setLabel('Snooze')
          .setEmoji({ name: 'snooze', id: '1259235534283477064' })
      )
      .toJSON() as MessageActionRow

    const dm = this.client.privateChannels.find(
      (channel) => channel.recipient.id === reminder.userId
    ) ?? (await this.client.rest.users.createDM(reminder.userId))

    const message = await dm.createMessage({
      content:
        `Hey <@${reminder.userId}>! Just wanted to remind you to \`${reminder.content}\`...`,
      components: [buttonRow]
    })

    await this.client.prisma.reminder.update({
      where: {
        id: id
      },
      data: {
        reminderMessageId: message.id
      }
    })
  }

  private async handleAITask(id: number) {
    const aiTask = await this.client.prisma.aITask.findUnique({
      where: {
        id: id
      }
    })

    if (!aiTask || !aiTask.isActive) return

    try {
      const personalityConfig = await this.client.prisma.userAIConfig
        .findUnique({
          where: { userId: aiTask.userId }
        })

      let personalityContext = ''
      if (personalityConfig) {
        const instructions: string[] = []

        if (personalityConfig.customPrompt) {
          instructions.push(personalityConfig.customPrompt)
        }

        const toneMap = {
          balanced:
            'Use a balanced tone that is neither too casual nor too formal.',
          casual: 'Use a casual, relaxed tone as if talking to a friend.',
          professional: 'Use a professional, formal tone.',
          friendly: 'Use a warm, friendly, and approachable tone.',
          sarcastic: 'Use a lighthearted, slightly sarcastic tone with humor.'
        }
        const toneInstructions =
          toneMap[personalityConfig.tone as keyof typeof toneMap] ||
          'Use a balanced tone.'

        const verbosityMap = {
          concise:
            'Keep responses very brief and to the point (1-2 sentences).',
          normal: 'Provide moderately detailed responses.',
          detailed: 'Provide thorough, detailed responses with explanations.',
          comprehensive:
            'Provide very comprehensive responses with extensive details and examples.'
        }
        const verbosityInstructions = verbosityMap[
          personalityConfig.verbosity as keyof typeof verbosityMap
        ] || 'Provide moderately detailed responses.'

        instructions.push(toneInstructions)
        instructions.push(verbosityInstructions)

        if (personalityConfig.personalityTags.length > 0) {
          const tagDescriptions: Record<string, string> = {
            humorous: 'Add appropriate humor and wit where suitable.',
            technical: 'Focus on technical accuracy and precision.',
            creative: 'Be creative and think outside the box.',
            empathetic: 'Show understanding and empathy.',
            witty: 'Use clever wordplay and wit.'
          }

          const activeTags = personalityConfig.personalityTags
            .map((tag: string) => tagDescriptions[tag])
            .filter(Boolean)

          if (activeTags.length > 0) {
            instructions.push(activeTags.join(' '))
          }
        }

        if (personalityConfig.excludedTopics.length > 0) {
          instructions.push(
            `Avoid discussing these topics: ${
              personalityConfig.excludedTopics.join(', ')
            }.`
          )
        }

        personalityContext = `Personality Instructions: ${
          instructions.join(' ')
        }`
      }

      // Get current date/time in user's timezone
      const now = new Date()
      const timezone = aiTask.timezone || 'UTC'
      const zonedTime = toZonedTime(now, timezone)
      const currentDateTime = format(
        zonedTime,
        "EEEE, MMMM do, yyyy 'at' h:mm a zzz",
        { timeZone: timezone }
      )

      const fullInstructions = personalityContext
        ? `${personalityContext}\n\nTask Instructions: ${aiTask.instructions}`
        : aiTask.instructions

      // Generate AI content
      const result = await generateAITaskContent({
        instructions: fullInstructions,
        currentDateTime,
        timezone: aiTask.timezone || undefined,
        userId: aiTask.userId,
        username: undefined, // We don't have username stored, but it's optional
        guildName: undefined // AI tasks are DM-only
      })

      if (!result.data) {
        console.error('Failed to generate AI task content: No data received')
        return
      }

      // Format the response using the shared formatter
      const formattedText = formatAskAIAnswer(result.data)
      if (!formattedText) {
        console.error('No content generated for AI task:', id)
        return
      }

      // Format for Discord response
      const responseOptions = formatLongResponse(
        `Hey <@${aiTask.userId}>! Here's your AI task update:\n\n${formattedText}`
      )

      // Send DM to user
      const dm = this.client.privateChannels.find(
        (channel) => channel.recipient.id === aiTask.userId
      ) ?? (await this.client.rest.users.createDM(aiTask.userId))

      await dm.createMessage(responseOptions)

      // Schedule next execution
      const nextRun = this.calculateNextRun(
        aiTask.intervalDays,
        aiTask.timeOfDay,
        aiTask.timezone
      )
      const delay = nextRun.getTime() - Date.now()

      await this.aiTask.add(
        'ai-task',
        { id: aiTask.id },
        { delay }
      )
    } catch (error) {
      console.error('Error handling AI task:', id, error)
    }
  }

  private calculateNextRun(
    intervalDays: number,
    timeOfDay: string,
    timezone?: string
  ): Date {
    const timeParts = timeOfDay.split(':')
    if (timeParts.length !== 2) {
      throw new Error(`Invalid time format: ${timeOfDay}`)
    }

    const hours = parseInt(timeParts[0]!, 10)
    const minutes = parseInt(timeParts[1]!, 10)

    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid time format: ${timeOfDay}`)
    }

    const tz = timezone || 'UTC'

    // Get current time in the target timezone
    const now = new Date()
    const zonedNow = toZonedTime(now, tz)

    // Create next run date in the target timezone
    const nextDate = addDays(new Date(zonedNow), intervalDays)
    nextDate.setHours(hours, minutes, 0, 0)

    // Convert back to UTC for scheduling
    return fromZonedTime(nextDate, tz)
  }

  public async scheduleAITask(aiTaskId: number, delayMs?: number) {
    const aiTask = await this.client.prisma.aITask.findUnique({
      where: { id: aiTaskId }
    })

    if (!aiTask || !aiTask.isActive) return

    let delay = delayMs
    if (!delay) {
      const nextRun = this.calculateNextRun(
        aiTask.intervalDays,
        aiTask.timeOfDay,
        aiTask.timezone
      )
      delay = nextRun.getTime() - Date.now()
    }

    // Ensure delay is positive
    if (delay <= 0) {
      delay = 60000 // 1 minute minimum
    }

    await this.aiTask.add(
      'ai-task',
      { id: aiTaskId },
      { delay }
    )
  }

  public async unscheduleAITask(aiTaskId: number) {
    // Remove all pending jobs for this AI task
    const jobs = await this.aiTask.getJobs(['waiting', 'delayed'])
    for (const job of jobs) {
      if (job.data.id === aiTaskId) {
        await job.remove()
      }
    }
  }
}
