import { slashCommand } from '../framework.ts'

export default slashCommand({
  name: 'ping',
  description: 'Check whether the bot is responding',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],

  async execute(context) {
    await context.reply('Pong!')
  }
})
