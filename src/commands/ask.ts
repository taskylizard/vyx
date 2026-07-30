import { slash } from '../bot/rosepack.ts'
import { botOwnerGuard } from '../discord/guards.ts'

export default slash({
  name: 'ask',
  description: 'Ask the AI',
  contexts: ['botDm', 'privateChannel', 'guild'],
  installations: ['user'],
  guards: [botOwnerGuard],
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
