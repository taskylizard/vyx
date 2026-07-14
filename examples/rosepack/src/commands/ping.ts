import { defineSlashCommand } from '../framework.ts'

export default defineSlashCommand({
  name: 'ping',
  description: 'Check whether the bot is responding',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],

  async execute(context) {
    await context.reply('Pong!')
  }
})
