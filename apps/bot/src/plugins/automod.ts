import { definePlugin, isTextableGuildChannel } from '#framework'
import {
  findAutomodMatches,
  getAutomodRules,
  logAutomodViolation
} from '../automod'

export default definePlugin({
  name: 'automod',
  onLoad: (client) => {
    client.on('messageCreate', async (message) => {
      if (message.author.bot) return
      if (!message.guildID) return
      if (!message.channel || !isTextableGuildChannel(message.channel)) return

      const content = message.content?.trim()
      if (!content) return

      try {
        const rules = await getAutomodRules(client, message.guildID)
        if (!rules.length) return

        const matches = findAutomodMatches(content, rules)
        if (!matches.length) return

        let deleted = true
        try {
          await message.delete('Automod violation')
        } catch (error) {
          deleted = false
          client.logger.warn('Failed to delete automod flagged message', {
            guildId: message.guildID,
            channelId: message.channelID,
            messageId: message.id,
            error
          })
        }

        await logAutomodViolation(client, {
          message,
          matches,
          content,
          deleted
        })
      } catch (error) {
        client.logger.error('Automod handler failure', {
          guildId: message.guildID,
          channelId: message.channelID,
          messageId: message.id,
          error
        })
      }
    })
  }
})
