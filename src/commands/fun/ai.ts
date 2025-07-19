import { generateText, streamText } from 'ai'
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { defineSlashCommand } from '#framework'
import type { Ai } from '#framework'
import { mainProvider } from '#framework/utils/ai'

export default defineSlashCommand({
  name: 'ai',
  description: 'AI related commands.',
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
      name: 'text',
      description: 'Generate text from a prompt.',
      options: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate text from.',
          required: true
        }
      },
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        await ctx.defer()

        try {
          const provider = mainProvider(ctx.client as unknown as { ai: Ai })
          const result = await generateText({
            model: provider('@cf/meta/llama-2-7b-chat-int8'),
            prompt
          })

          await ctx.editReply({ content: result.text })
        } catch (error) {
          ctx.client.logger.error('AI (Text):', error)
          await ctx.editReply({
            content:
              "This errored and I have no idea why, but I've logged it."
          })
        }
      }
    },
    {
      name: 'image',
      description: 'Generate an image from a prompt.',
      options: {
        prompt: {
          type: 'string',
          description: 'The prompt to generate an image from.',
          required: true
        }
      },
      async run(ctx) {
        const prompt = ctx.options.getString('prompt', true)
        await ctx.defer()

        try {
          const provider = mainProvider(ctx.client as unknown as { ai: Ai })
          const result = await streamText({
            model: provider('@cf/stabilityai/stable-diffusion-xl-base-1.0'),
            prompt
          })

          await ctx.editReply({ content: result.textStream.toString() })
        } catch (error) {
          ctx.client.logger.error('AI (Image):', error)
          await ctx.editReply({
            content:
              "This errored and I have no idea why, but I've logged it."
          })
        }
      }
    }
  ]
})
