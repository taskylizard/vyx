import { ApplicationIntegrationTypes, InteractionContextTypes } from 'oceanic.js'
import { defineSlashCommand } from '../bot/framework.ts'

export default defineSlashCommand({
  name: 'ask',
  description: 'Ask the AI',
  contexts: [
    InteractionContextTypes.GUILD,
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.GUILD_INSTALL,
    ApplicationIntegrationTypes.USER_INSTALL
  ],
  options: {
    ephemeral: {
      description: 'Should only you see the answer?',
      kind: 'boolean'
    },
    question: {
      description: 'What do you want to ask?',
      kind: 'string',
      required: true
    }
  },
  async execute(context) {
    const { question, ephemeral = false } = context.options
    await context.defer({ ephemeral })
    await context.bot.responder.answerPrompt(context.bot, context.interaction, question)
  }
})
