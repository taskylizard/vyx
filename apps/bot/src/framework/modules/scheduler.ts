import { ActionRow, Button } from '@oceanicjs/builders'
import { type ConnectionOptions, Queue, Worker } from 'bullmq'
import { ButtonStyles, type MessageActionRow } from 'oceanic.js'
import type { Client } from '../client'

export class SchedulerModule {
  public reminder: Queue
  public reminderWorker: Worker

  public constructor(
    private client: Client
  ) {
    const connectionOptions: ConnectionOptions = {
      host: this.client.env.REDIS_HOST,
      port: Number(this.client.env.REDIS_PORT)
    }
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
}
