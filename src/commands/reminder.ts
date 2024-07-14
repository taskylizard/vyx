import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js';
import parse from 'parse-duration';
import { defineSlashCommand } from '#framework';

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
          type: ApplicationCommandOptionTypes.STRING,
          name: 'time',
          description: 'The time to remind you in.',
          required: true
        },
        {
          type: ApplicationCommandOptionTypes.STRING,
          name: 'message',
          description: 'What to remind you of?',
          required: true
        }
      ],
      async run(ctx) {
        const reminder = ctx.options.getString('message', true);
        const delay = parse(ctx.options.getString('time', true));
        if (typeof delay !== 'number') {
          return await ctx.reply(
            'The time you input is invalid! The format must be a human readable string, i.e: `1h30m25s`.'
          );
        }
        const time = new Date(Date.now() + delay);
        const msg = await ctx.followUp({
          content: 'Creating your reminder...'
        });

        const message = await msg.getMessage();

        const { id } = await ctx.client.prisma.reminder.create({
          data: {
            userId: ctx.user.id,
            content: reminder,
            time,
            messageLink: message.jumpLink
          }
        });

        await ctx.client.modules.scheduler.reminder.add(
          'reminder',
          { id },
          { delay }
        );

        return await ctx.interaction.editFollowup(message.id, {
          content: `Alright ${ctx.user.mention}, I'll remind you in <t:${Math.trunc(
            time.getTime() / 1000
          )}:R> to \`${reminder}\`.`
        });
      }
    },
    {
      name: 'list',
      description: 'List all your reminders.',
      async run(ctx) {
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
        });

        if (reminders.length === 0) {
          return await ctx.reply('Looks like you have no reminders, good job!');
        }

        let content = "Here's your reminders!\n";
        for (const reminder of reminders) {
          content += `- \`${reminder.id}\`: ${reminder.content}: [link](${reminder.messageLink}) (<t:${Math.trunc(
            reminder.time.getTime() / 1000
          )}:R>)\n`;
        }

        return await ctx.reply(content);
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
        const id = ctx.options.getInteger('reminder', true);
        const reminder = await ctx.client.prisma.reminder.delete({
          where: {
            id: Number(id)
          }
        });
        return await ctx.reply(`Deleted \`${reminder.content}\`!`);
      }
    }
  ]
});
