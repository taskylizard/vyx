import { definePlugin, isTextableGuildChannel } from '#framework'
import { ChannelTypes } from 'oceanic.js'
import { handleForumMessage } from '../framework/query-engine-handler'

export default definePlugin({
  name: 'query-engine',
  onLoad: (client) => {
    client.on('messageCreate', async (message) => {
      if (message.author.bot) return
      if (!message.channel || !isTextableGuildChannel(message.channel)) return
      if (!message.guildID) return

      // Forum answers
      if (
        isTextableGuildChannel(message.channel) &&
        message.channel.type === ChannelTypes.PUBLIC_THREAD &&
        message.channel.parent?.type === ChannelTypes.GUILD_FORUM
      ) {
        // Check if this is the configured forum channel
        const forumChannelId = await client.modules.queryEngine
          .getForumChannelId(message.guildID)
        if (forumChannelId && message.channel.parentID === forumChannelId) {
          // Check if query engine is properly set up
          const { isComplete } = await client.modules.queryEngine
            .isSetupComplete(message.guildID)
          if (!isComplete) {
            console.warn(
              `Query engine not set up for guild ${message.guildID}, skipping forum response`
            )
            return
          }

          await handleForumMessage(client, message)
        }
      }
    })
  }
})
