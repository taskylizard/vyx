import { readFile } from 'node:fs/promises'
import { sample } from '@antfu/utils'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  ChannelTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { Embed, defineSlashCommand, emojis } from '#framework'

export default defineSlashCommand({
  name: 'ai',
  description: 'ai module',
  guildOnly: true,
  subcommands: [
    {
      name: 'text',
      description: 'Generate text.',
      options: [
        {
          name: 'prompt',
          description: 'The prompt to generate text from.',
          type: ApplicationCommandOptionTypes.STRING,
          required: true,
          minLength: 5,
          maxLength: 500
        },
        {
          name: 'tools',
          description: 'Use tools like math, search, and wikipedia.',
          type: ApplicationCommandOptionTypes.BOOLEAN,
          required: false
        }
      ],
      contexts: [
        InteractionContextTypes.BOT_DM,
        InteractionContextTypes.GUILD,
        InteractionContextTypes.PRIVATE_CHANNEL
      ],
      integrationTypes: [
        ApplicationIntegrationTypes.USER_INSTALL,
        ApplicationIntegrationTypes.GUILD_INSTALL
      ],
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

        const generation = await ctx.client.modules.ai.text(prompt, useTool)
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

        const em = embed.setImage(null!).setDescription(generation.result)

        return await ctx.interaction.editOriginal({
          embeds: [em],
          files: [],
          attachments: []
        })
      }
    }
    // {
    //   name: 'chat',
    //   description: 'Chat with the AI in a conversational thread.',
    //   async run(ctx) {
    //     if (
    //       (ctx.channel && ctx.channel.type !== ChannelTypes.GUILD_TEXT) ||
    //       ctx.channel === undefined
    //     ) {
    //       return await ctx.reply(
    //         'This command can only be used in text channels.'
    //       )
    //     }
    //
    //     await ctx.interaction.editOriginal({
    //       content: 'Starting a new thread...'
    //     })
    //
    //     const thread = await ctx.channel.startThreadWithoutMessage({
    //       name: `${sample(emojis, 1)} Thread for ${ctx.user.username}`,
    //       type: ChannelTypes.PUBLIC_THREAD
    //     })
    //     await ctx.client.modules.ai.startChatThread(thread.id)
    //
    //     return await ctx.interaction.editOriginal({
    //       content: `Thread started! You can now chat with the AI in ${thread.mention}`
    //     })
    //   }
    // }
  ]
})
