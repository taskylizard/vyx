import { defineSlashCommand, Embed } from '#framework'
import { getMessages, smugshroom } from '@packages/inference-engine'

import { buildPromptContext, requestAskAI } from '#framework'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'

export default defineSlashCommand({
  name: 'ai',
  description: 'Generate text using AI.',
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
      name: 'chat',
      description: 'Chat with AI, ask it questions.',
      options: [
        {
          name: 'prompt',
          type: ApplicationCommandOptionTypes.STRING,
          description: 'Meaningful prompt, use quotes if necessary.',
          required: true
        },
        {
          name: 'ephemeral',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          description:
            'Ephemeral, only visible to the user who ran the command.',
          required: false
        }
      ],
      cooldown: 5,
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        const ephemeral = ctx.options.getBoolean('ephemeral', false)

        if (ephemeral) {
          await ctx.defer(64)
        }

        const loading = await Bun.fetch(
          'https://github.com/taskylizard/kanikou/blob/trunk/apps/bot/public/loading.gif?raw=true'
        )
        const response = await loading.arrayBuffer()
        const buffer = Buffer.from(response)

        const embed = new Embed()
          .setFooter({
            text:
              'Generative content may produce offensive results, use responsibly.'
          })
          .setAuthor({
            name: prompt,
            iconURL: ctx.user.avatarURL()
          })
          .setImage('attachment://loading.gif')

        await ctx.interaction.editOriginal({
          embeds: [embed],
          files: [
            {
              name: 'loading.gif',
              contents: buffer
            }
          ]
        })

        const context = buildPromptContext(ctx.client, [], prompt)
        const generation = await requestAskAI(
          ctx.client,
          context,
          'mention',
          ctx.user.id,
          ctx.interaction.guildID ?? undefined,
          ctx.user.username,
          ctx.guild?.name ?? undefined
        )

        if (!generation.ok) {
          const em = embed
            .setImage(null!)
            .setDescription(
              ':warning: Some error occurred while generating text. Please try again.'
            )
          return await ctx.interaction.editOriginal({
            embeds: [em],
            files: [],
            attachments: []
          })
        }

        const em = embed
          .setImage(null!)
          .setDescription(generation.text ?? 'No output')

        return await ctx.interaction.editOriginal({
          embeds: [em],
          files: [],
          attachments: []
        })
      }
    },
    {
      name: 'smugshroom',
      description: 'The cringe-inducing AI-powered summary generator.',
      cooldown: 10,
      async run(ctx) {
        const msg = await ctx.followUp({ content: 'Summarizing...' })
        const message = await msg.getMessage()
        const messages = await getMessages(ctx.interaction.channel as any, 25)

        if (typeof messages === 'undefined') {
          return await ctx.reply('No messages were found.')
        }

        const _summary = await smugshroom(messages)
        const removeQuotes = (text: string) => text.replace(/"([^"]*)"/g, '$1')
        const summary = removeQuotes(_summary)
        return await ctx.interaction.editFollowup(message.id, {
          content: summary
        })
      }
    }
  ]
})
