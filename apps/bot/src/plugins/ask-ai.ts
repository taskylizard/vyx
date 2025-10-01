import {
  definePlugin,
  fetchMessageCached,
  isTextableGuildChannel
} from '#framework'
import { handleMention, handleReply } from '../framework/ask-ai-handler'

export default definePlugin({
  name: 'ask-ai',
  onLoad: (client) => {
    client.on('messageCreate', async (message) => {
      if (message.author.bot) return
      if (!message.channel || !isTextableGuildChannel(message.channel)) return

      // Reply to bot's messages (continuing conversation)
      if (message.referencedMessage?.id) {
        const referencedMessage = await fetchMessageCached(
          client,
          message.channel,
          message.referencedMessage.id
        ).catch(() => null)
        if (referencedMessage?.author.id === client.user?.id) {
          await handleReply(client, message, referencedMessage)
          return
        }
      }

      // Mention answers (starting new conversation)
      if (message.content.includes(`<@${client.user?.id}>`)) {
        await handleMention(client, message)
      }
    })
  }
})
