import { ApplicationCommandOptionTypes } from 'oceanic.js';
import { defineSlashCommand } from '#framework';

const VERIFIED_ROLE = '785802803565559818';

export default defineSlashCommand({
  name: 'taskyland',
  description: 'taskyland module',
  guildOnly: true,
  guilds: ['785056354673885221'],
  subcommands: [
    {
      name: 'verify',
      description: 'Verify a member into the server.',
      ownerOnly: true,
      options: [
        {
          name: 'member',
          description: 'The member to verify.',
          type: ApplicationCommandOptionTypes.USER,
          required: true
        }
      ],
      async run(ctx) {
        const member = ctx.options.getMember('member');
        if (!member)
          return await ctx.reply(
            'You need to provide a member to verify.',
            true
          );

        await member.addRole(VERIFIED_ROLE);
        return await ctx.reply(
          `Successfully verified ${member.user.tag}.`,
          true
        );
      }
    }
  ]
});
