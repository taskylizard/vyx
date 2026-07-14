import { defineSlashCommand } from '../bot/rosepack.ts'

export default defineSlashCommand({
  name: 'ask',
  description: 'Ask the AI',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],
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
    await context.app.responder.answerPrompt(context.app, context.interaction, question)
  }
})
