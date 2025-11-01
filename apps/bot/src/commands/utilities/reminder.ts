import { defineSlashCommand } from '#framework'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import parse from 'parse-duration'
import {
  generateReminderSummary,
  parseNaturalLanguageReminder
} from '../../services/ai-reminder'

export default defineSlashCommand({
  name: 'reminder',
  description: 'Manage your reminders.',
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  subcommands: [
    {
      name: 'create',
      description: 'Create a reminder.',
      options: [
        {
          name: 'time',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'The time to remind you in (e.g., 1h30m, 2 days).',
          required: false
        },
        {
          name: 'message',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'What to remind you of?',
          required: false
        },
        {
          name: 'nlp',
          type: ApplicationCommandOptionTypes.STRING,
          description:
            'Natural language reminder like "call mom tomorrow evening"',
          required: false
        }
      ],
      async run(ctx) {
        const reminderText = ctx.options.getString('message', false)
        const timeText = ctx.options.getString('time', false)
        const nlpInput = ctx.options.getString('nlp', false)

        // Validate that user provided at least one way to create a reminder
        if (!reminderText && !timeText && !nlpInput) {
          return await ctx.reply({
            content: 'Please provide either:\n' +
              '• **Traditional**: Both `time` and `message` fields\n' +
              '• **Natural language**: The `nlp` field with something like "call mom tomorrow evening"',
            flags: 64
          })
        }

        // If NLP input is provided, use AI to parse it
        if (nlpInput) {
          const msg = await ctx.followUp({
            content: 'Parsing your natural language reminder...'
          })
          const message = await msg.getMessage()

          const userInfo = {
            userId: ctx.user.id,
            guildId: ctx.interaction.guildID ?? undefined,
            username: ctx.user.username,
            guildName: ctx.guild?.name ?? undefined
          }

          const parsed = await parseNaturalLanguageReminder(nlpInput, userInfo)

          if (!parsed || !parsed.title || parsed.timeOffset === null) {
            return await ctx.interaction.editFollowup(message.id, {
              content:
                "I couldn't understand that reminder. Try something like:\n" +
                '• "remind me to call mom tomorrow at 6pm"\n' +
                '• "take medication in 2 hours"\n' +
                '• "meeting with team next Monday morning"\n\n' +
                'Or use the traditional `time` and `message` fields instead.'
            })
          }

          const delay = parsed.timeOffset
          const time = new Date(Date.now() + delay)
          const { id } = await ctx.client.prisma.reminder.create({
            data: {
              userId: ctx.user.id,
              content: parsed.title,
              time,
              messageLink: message.jumpLink
            }
          })

          await ctx.client.modules.scheduler.reminder.add(
            'reminder',
            { id },
            { delay }
          )

          const recurrenceText = parsed.recurrence
            ? ` - Recurring: ${parsed.recurrence}`
            : ''

          return await ctx.interaction.editFollowup(message.id, {
            content: `Got it! I'll remind you in <t:${
              Math.trunc(time.getTime() / 1000)
            }:R> to **${parsed.title}**${recurrenceText}.`
          })
        }

        // Traditional flow - require both fields if not using NLP
        if (!reminderText || !timeText) {
          return await ctx.reply({
            content:
              'For traditional reminders, both `time` and `message` are required.\n' +
              'Or use the `nlp` field for natural language input!',
            flags: 64
          })
        }

        const delay = parse(timeText)
        if (typeof delay !== 'number') {
          return await ctx.reply({
            content:
              'The time you input is invalid! The format must be a human readable string, i.e: `1h30m25s`.',
            flags: 64
          })
        }

        const time = new Date(Date.now() + delay)
        const msg = await ctx.followUp({
          content: 'Creating your reminder...'
        })

        const message = await msg.getMessage()

        const { id } = await ctx.client.prisma.reminder.create({
          data: {
            userId: ctx.user.id,
            content: reminderText,
            time,
            messageLink: message.jumpLink
          }
        })

        await ctx.client.modules.scheduler.reminder.add(
          'reminder',
          { id },
          { delay }
        )

        return await ctx.interaction.editFollowup(message.id, {
          content: `Alright ${ctx.user.mention}, I'll remind you in <t:${
            Math.trunc(time.getTime() / 1000)
          }:R> to \`${reminderText}\`.`
        })
      }
    },
    {
      name: 'list',
      description: 'List all your reminders.',
      options: [
        {
          name: 'ai-summary',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description: 'Include AI-powered smart summary of your reminders',
          required: false
        }
      ],
      async run(ctx) {
        const includeAISummary = ctx.options.getBoolean('ai-summary', false)

        const reminders = await ctx.client.prisma.reminder.findMany({
          where: {
            userId: ctx.user.id,
            time: {
              gte: new Date()
            }
          },
          orderBy: {
            time: 'asc'
          }
        })

        if (reminders.length === 0) {
          return await ctx.reply('Looks like you have no reminders, good job!')
        }

        let content = ''
        let message: any = null

        // Add AI summary if requested and we have reminders
        if (includeAISummary && reminders.length > 0) {
          const msg = await ctx.followUp({
            content: 'Generating smart summary of your reminders...'
          })
          message = await msg.getMessage()

          const userInfo = {
            userId: ctx.user.id,
            guildId: ctx.interaction.guildID ?? undefined,
            username: ctx.user.username,
            guildName: ctx.guild?.name ?? undefined
          }

          const summary = await generateReminderSummary(
            reminders.map((r: { content: string; time: Date }) => ({
              content: r.content,
              time: r.time
            })),
            userInfo
          )

          if (summary) {
            content = summary.summary
          }
        } else {
          content += "Here's your reminders!\n"

          // Add the traditional list
          for (const reminder of reminders) {
            content +=
              `- \`${reminder.id}\`: ${reminder.content}: [link](${reminder.messageLink}) (<t:${
                Math.trunc(reminder.time.getTime() / 1000)
              }:R>)\n`
          }
        }

        if (message) {
          // Edit the existing followup message
          return await ctx.interaction.editFollowup(message.id, {
            content: content
          })
        }

        return await ctx.reply(content)
      }
    },
    {
      name: 'delete',
      description: 'Delete a reminder.',
      options: [
        {
          name: 'reminder',
          description: 'Reminder to delete.',
          required: true,
          type: ApplicationCommandOptionTypes.INTEGER
        }
      ],
      async run(ctx) {
        const id = ctx.options.getInteger('reminder', true)
        const reminder = await ctx.client.prisma.reminder.delete({
          where: {
            id: Number(id)
          }
        })
        return await ctx.reply(`Deleted \`${reminder.content}\`!`)
      }
    }
  ]
})
