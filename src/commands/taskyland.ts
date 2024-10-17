import { ApplicationCommandOptionTypes, type TextChannel } from 'oceanic.js'
import { defineSlashCommand } from '#framework'

const VERIFIED_ROLE = '785802803565559818'

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
    },
    {
      name: 'download',
      description: 'Download a track.',
      ownerOnly: true,
      options: [
        {
          name: 'url',
          description: 'The url of the track to download.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        }
      ],
      async run(ctx) {
        const url = ctx.options.getString('url', true)

        await ctx.client.modules.lucida.download(ctx, url)
        return
      }
    },
    {
      name: 'search',
      description: 'Search for a track.',
      ownerOnly: true,
      options: [
        {
          name: 'query',
          description: 'The query to search for.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true
        },
        {
          name: 'kind',
          description: 'The kind of track to search for.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true,
          choices: [
            {
              name: 'Track',
              value: 'track'
            },
            {
              name: 'Album',
              value: 'album'
            }
          ]
        }
      ],
      async run(ctx) {
        const query = ctx.options.getString('query', true)
        const kind = ctx.options.getString('kind', true)

        const results = await ctx.client.modules.lucida.search(
          query,
          kind as 'track' | 'album',
          10
        )

        return await ctx.reply(results, true)
      }
    }
  ]
})
