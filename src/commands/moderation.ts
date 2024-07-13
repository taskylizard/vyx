import { ActionRow, Button } from '@oceanicjs/builders';
import {
  ApplicationCommandOptionTypes,
  ButtonStyles,
  type InteractionContent,
  type MessageActionRow,
  type User
} from 'oceanic.js';
import parse from 'parse-duration';
import { Embed, defineSlashCommand, splitArray } from '#framework';

export default defineSlashCommand({
  name: 'moderation',
  moduleId: 'MODERATION',
  description: 'Server moderation commands!',
  guildOnly: true,
  requiredPermissions: ['VIEW_AUDIT_LOG', 'MANAGE_GUILD'],
  subcommands: [
    {
      name: 'config',
      description: 'Moderation config options.',
      subcommands: [
        {
          name: 'reports',
          description: 'Set or remove the server reports channel.',
          options: [
            {
              name: 'channel',
              description:
                "The report channel, don't pass anything to disable reporting.",
              type: ApplicationCommandOptionTypes.CHANNEL
            }
          ],
          async run(ctx) {
            const reportsChannel = ctx.options.getChannel('channel')
              ? BigInt(ctx.options.getChannel('channel', true).id)
              : null;

            await ctx.client.prisma.config.upsert({
              where: {
                guildId: BigInt(ctx.interaction.guildID!)
              },
              update: {
                reportsChannel
              },
              create: {
                reportsChannel,
                guildId: BigInt(ctx.interaction.guildID!)
              }
            });

            const action =
              typeof reportsChannel === 'bigint' ? 'Set' : 'Disabled';
            return await ctx.reply(`${action} reports channel.`);
          }
        },
        {
          name: 'logs',
          description:
            'Set your moderation logs channel or disable logging entirely.',
          options: [
            {
              name: 'channel',
              type: ApplicationCommandOptionTypes.CHANNEL,
              description: "Logs channel, don't pass anything to disable."
            }
          ],
          async run(ctx) {
            const channel = ctx.options.getChannel('channel');
            const logsChannel = channel ? BigInt(channel.id) : undefined;
            const message = channel
              ? `Successfully set the Logs channel to ${channel.mention}.`
              : 'Disabled logging.';

            await ctx.client.prisma.config.update({
              where: {
                guildId: BigInt(ctx.interaction.guildID!)
              },
              data: {
                logsChannel
              }
            });

            return await ctx.reply(message);
          }
        }
      ]
    },
    {
      name: 'timeout',
      description: 'Timeout problematic members.',
      guildOnly: true,
      requiredPermissions: ['MODERATE_MEMBERS'],
      options: [
        {
          name: 'user',
          description: 'The user.',
          type: ApplicationCommandOptionTypes.USER,
          required: true
        },
        {
          name: 'duration',
          description: 'The time to mute them for.',
          required: true,
          type: ApplicationCommandOptionTypes.STRING
        },
        {
          name: 'reason',
          description: 'The reasoning.',
          maxLength: 1024,
          type: ApplicationCommandOptionTypes.STRING
        }
      ],
      async run(ctx) {
        const member = ctx.options.getMember('user', true);
        const duration = parse(ctx.options.getString('duration', true));
        const reason = ctx.options.getString('reason') ?? 'No reason given.';

        if (member.id === ctx.interaction.user.id) {
          return await ctx.reply("You can't mute yourself.", true);
        }

        if (member.id === ctx.interaction.guild!.ownerID) {
          return await ctx.reply("You can't mute the owner.", true);
        }

        if (
          ctx.client.compareMemberToMember(member, ctx.interaction.member!) !==
          'lower'
        ) {
          return await ctx.reply(
            "You can't mute them as that member's highest role is higher than or as high as your highest role.",
            true
          );
        }

        if (
          ctx.client.compareMemberToMember(
            member,
            ctx.interaction.guild!.clientMember
          ) !== 'lower'
        ) {
          return await ctx.reply(
            "I cannot mute them as that member's highest role is higher than or as high as my highest role.",
            true
          );
        }

        if (
          member.communicationDisabledUntil &&
          member.communicationDisabledUntil >= new Date()
        ) {
          return await ctx.reply('This member is already timed out.', true);
        }

        if (typeof duration !== 'number')
          return await ctx.reply('That is not a valid duration!');

        const caseObj = await ctx.client.modules.cases.create(
          ctx.interaction.guildID!,
          member.user,
          ctx.interaction.user,
          'timeout',
          reason!
        );

        const time = new Date(Date.now() + duration);
        await member.edit({
          reason: reason,
          communicationDisabledUntil: time.toISOString()
        });

        const embed = new Embed()
          .setTitle('Timed out!')
          .setThumbnail(member.avatarURL())
          .addFields([
            { name: 'Timed out by', value: ctx.interaction.user.mention },
            { name: 'Timed out', value: member.user.mention },
            {
              name: 'Duration',
              value: `<t:${Math.trunc(time.getTime() / 1000)}:R>`
            },
            { name: 'Reason', value: reason },
            { name: 'Case ID', value: caseObj.caseId.toString() }
          ]);

        await ctx.reply([embed]);
        return await ctx.client.modules.cases.log(
          ctx.interaction.guildID!,
          caseObj
        );
      }
    },
    {
      name: 'kick',
      description: 'Kick someome out.',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionTypes.USER,
          required: true,
          description: 'The user.'
        },
        {
          name: 'reason',
          type: ApplicationCommandOptionTypes.STRING,
          required: false,
          maxLength: 1024,
          description: 'The reason for this kick.'
        }
      ],
      async run(ctx) {
        const member = ctx.options.getMember('user', true);
        const reason = ctx.options.getString('reason') ?? 'No reason provided.';

        if (!member) {
          return await ctx.reply('That member seems to be missing?', true);
        }

        if (member.user.id === ctx.user.id) {
          return await ctx.reply("You can't kick yourself dumbass");
        }

        if (
          ctx.client.compareMemberToMember(member, ctx.interaction.member!) !==
          'lower'
        ) {
          return await ctx.reply(
            "You can't kick them as that member's highest role is higher than or as high as your highest role.",
            true
          );
        }

        if (
          ctx.client.compareMemberToMember(
            member,
            ctx.interaction.guild!.clientMember
          ) !== 'lower'
        ) {
          return await ctx.reply(
            "I cannot kick them as that member's highest role is higher than or as high as my highest role.",
            true
          );
        }

        const caseObj = await ctx.client.modules.cases.create(
          ctx.guild!.id,
          member.user,
          ctx.user,
          'kick',
          reason
        );

        await member.kick(reason);

        const embed = new Embed()
          .setTitle('Kicked!')
          .setDescription('Successfully kicked that member!')
          .setThumbnail(member.avatarURL())
          .addFields([
            { name: 'Moderator', value: ctx.user.mention },
            { name: 'Kicked', value: member.user.mention },
            { name: 'Reason', value: reason },
            { name: 'Case ID', value: caseObj.caseId.toString() }
          ]);

        await ctx.client.modules.cases.log(ctx.guild!.id!, caseObj);
        return await ctx.reply([embed]);
      }
    },
    {
      name: 'warn',
      description: 'Warn someone.',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionTypes.USER,
          required: true,
          description: 'The user.'
        },
        {
          name: 'reason',
          type: ApplicationCommandOptionTypes.STRING,
          required: false,
          maxLength: 1024,
          description: 'The reason for this warn.'
        }
      ],
      async run(ctx) {
        const member = ctx.options.getMember('user', true);
        const reason = ctx.options.getString('reason') ?? 'No reason provided.';

        if (member.user.id === ctx.user.id)
          return await ctx.reply("You can't warn yourself.", true);

        const caseObj = await ctx.client.modules.cases.create(
          ctx.guild!.id,
          member.user,
          ctx.user,
          'warn',
          reason
        );

        const embed = new Embed()
          .setTitle('Warned!')
          .setDescription('Successfully warned that member!')
          .setThumbnail(member.avatarURL())
          .addFields([
            { name: 'Moderator', value: ctx.user.mention },
            { name: 'User', value: member.user.mention },
            { name: 'Reason', value: reason },
            { name: 'Case ID', value: caseObj.caseId.toString() }
          ]);

        await ctx.client.modules.cases.log(ctx.guild!.id, caseObj);

        return await ctx.reply([embed]);
      }
    },
    {
      name: 'ban',
      description: 'Ban someone out.',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionTypes.USER,
          required: true,
          description: 'The user.'
        },
        {
          name: 'reason',
          type: ApplicationCommandOptionTypes.STRING,
          required: false,
          maxLength: 1024,
          description: 'The reason for this ban.'
        }
      ],
      async run(ctx) {
        const member = ctx.options.getMember('user', true);
        const reason = ctx.options.getString('reason') ?? 'No reason provided.';

        if (member.user.id === ctx.user.id) {
          return await ctx.reply("You can't ban yourself dumbass", true);
        }

        if (
          ctx.client.compareMemberToMember(member, ctx.interaction.member!) !==
          'lower'
        ) {
          return await ctx.reply(
            "You can't ban them as that member's highest role is higher than or as high as your highest role.",
            true
          );
        }

        if (
          ctx.client.compareMemberToMember(
            member,
            ctx.interaction.guild!.clientMember
          ) !== 'lower'
        ) {
          return await ctx.reply(
            "I cannot ban them as that member's highest role is higher than or as high as my highest role.",
            true
          );
        }

        const caseObj = await ctx.client.modules.cases.create(
          ctx.guild!.id,
          member.user,
          ctx.user,
          'ban',
          reason
        );

        await member.ban({ reason });

        const embed = new Embed()
          .setTitle('Banned!')
          .setDescription('Successfully banned that member!')
          .setThumbnail(member.avatarURL())
          .addFields([
            { name: 'Moderator', value: ctx.user.mention },
            { name: 'Banned', value: member.user.mention },
            { name: 'Reason', value: reason },
            { name: 'Case ID', value: caseObj.caseId.toString() }
          ]);

        await ctx.client.modules.cases.log(ctx.guild!.id!, caseObj);
        return await ctx.reply([embed]);
      }
    },
    {
      name: 'case',
      description: 'View moderation cases.',
      subcommands: [
        {
          name: 'list',
          description: 'List moderation cases.',
          options: [
            {
              name: 'user',
              description: 'The user.',
              type: ApplicationCommandOptionTypes.USER,
              required: true
            }
          ],
          async run(ctx) {
            const page = 0;
            const user: User = ctx.options.getUser('user', true);

            if (!user) {
              return await ctx.reply('Could not find case for that user.');
            }

            const cases = await ctx.client.modules.cases.getMany(
              ctx.interaction.guildID!,
              user
            );

            if (!cases)
              return await ctx.reply(
                "This server doesn't have moderation logging setup."
              );

            const chunk = splitArray(cases, 10);

            const embed = new Embed()
              .setTitle(`Cases for ${user.username}`)
              .setThumbnail(user.avatarURL());

            const replyOptions: InteractionContent = {
              embeds: [embed]
            };

            if (!cases.length) {
              return await ctx.reply(
                'I could not find any cases for that user.',
                true
              );
            }

            chunk[page].forEach((caseData) => {
              embed.addFields([
                {
                  name: `#${caseData.caseId} (${caseData.type.toUpperCase()}) <t:${caseData.createdAt / 1000n}:R>`,
                  value: caseData.reason
                }
              ]);
            });

            if (chunk.length > 1) {
              const backButton = new Button(
                ButtonStyles.PRIMARY,
                `action.cases.list-${ctx.interaction.user.id}.${user.id}.${page - 1}`
              ).setLabel('Back');
              const nextButton = new Button(
                ButtonStyles.PRIMARY,
                `action.cases.list-${ctx.interaction.user.id}.${user.id}.${page + 1}`
              ).setLabel('Next');

              page === 0 && backButton.disable();
              page + 1 === chunk.length && nextButton.disable();
              const row = new ActionRow()
                .addComponents(backButton, nextButton)
                .toJSON() as MessageActionRow;
              replyOptions.components = [row];
            }

            return await ctx.reply(replyOptions);
          }
        },
        {
          name: 'view',
          description: 'View a moderation case.',
          options: [
            {
              name: 'id',
              description: 'ID of the moderation case.',
              type: ApplicationCommandOptionTypes.INTEGER,
              minValue: 1,
              required: true
            }
          ],
          async run(ctx) {
            const id = ctx.options.getInteger('id', true);
            const caseObj = await ctx.client.modules.cases.getOne(
              ctx.interaction.guildID!,
              id
            );

            if (!caseObj) {
              return await ctx.reply('Could not find that case.');
            }

            const user = await ctx.client.rest.users.get(
              String(caseObj.moderatedUser)
            );
            const creator = await ctx.client.rest.users.get(
              String(caseObj.caseCreator)
            );

            const embed = new Embed()
              .setTitle(`Case: ${id}`)
              .setThumbnail(user.avatarURL())
              .addFields([
                { name: 'User', value: user.tag },
                { name: 'Moderator', value: creator.tag },
                {
                  name: 'Type',
                  value: caseObj.type.toUpperCase()
                },
                { name: 'Reason', value: caseObj.reason },
                {
                  name: 'Created at',
                  value: `<t:${caseObj.createdAt / 1000n}:d> (<t:${
                    caseObj.createdAt / 1000n
                  }:R>)`
                }
              ]);

            return await ctx.reply({ embeds: [embed] });
          }
        }
      ]
    }
  ]
});
