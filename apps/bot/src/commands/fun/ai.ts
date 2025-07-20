import { readFile } from 'node:fs/promises'
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { Embed, defineSlashCommand } from '#framework'
import {
  getMessages,
  textifyMessageForTaskModels
} from '../../framework/modules/ai-internals/smugshroom'

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
      options: {
        prompt: {
          type: 'string',
          description: 'Meaningful prompt, use quotes if necessary.',
          required: true
        },
        tools: {
          type: 'boolean',
          description: 'Use tools like math, search, and wikipedia.',
          required: false
        }
      },
      cooldown: 5,
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        const useTool = ctx.options.getBoolean('tools', false)
        const loading = await readFile('public/loading.gif')
        const buffer = Buffer.from(loading)

        const embed = new Embed()
          .setFooter({
            text: 'Generative content may produce offensive results, use responsibly.'
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

        const generation = await ctx.client.modules.ai.chat(prompt, useTool)
        if (!generation.ok) {
          const em = embed
            .setImage(null!)
            .setDescription(
              ":warning: This prompt is unsafe to generate text from. Please don't misuse AI cycles."
            )
          return await ctx.interaction.editOriginal({
            embeds: [em],
            files: [],
            attachments: []
          })
        }

        const em = embed
          .setImage(null!)
          .setDescription(generation.result ?? 'No output')

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

        const _summary = await ctx.client.modules.ai.smugshroom(messages)
        const removeQuotes = (text: string) => text.replace(/"([^"]*)"/g, '$1')
        const summary = removeQuotes(_summary)
        return await ctx.interaction.editFollowup(message.id, {
          content: summary
        })
      }
    }
  ]
})
