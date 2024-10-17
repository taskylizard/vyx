import { ApplicationCommandOptionTypes, type TextChannel } from 'oceanic.js'
import { defineSlashCommand } from '#framework'

const VERIFIED_ROLE = '785802803565559818'
const VERIFIER_ROLE = '1296555754395795506'

export default defineSlashCommand({
  name: 'taskyland',
  description: 'taskyland module',
  guildOnly: true,
  guilds: ['785056354673885221'],
  subcommands: [
    {
      name: 'verify',
      description: 'Verify a member into the server.',
      options: [
        {
          name: 'member',
          description: 'The member to verify.',
          type: ApplicationCommandOptionTypes.USER,
          required: true
        }
      ],
      check(ctx) {
        if (ctx.member!.roles.includes(VERIFIER_ROLE)) {
          return true
        }
        return false
      },
      async run(ctx) {
        const member = ctx.options.getMember('member', true)

        await member.addRole(VERIFIED_ROLE)
        const chatroom = (await ctx.client.rest.channels.get(
          '1288962477542866944'
        )) as TextChannel
        await chatroom.createMessage({
          content: `Welcome ${member.user.mention} to the server! :tada:`
        })
        return await ctx.reply(
          `Successfully verified ${member.user.tag}.`,
          true
        )
      }
    }
  ]
})
