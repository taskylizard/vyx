import { definePlugin } from '#framework'

export default definePlugin({
  name: 'Guild Size Filter',
  onLoad(client) {
    client.on('guildCreate', async (guild) => {
      if (guild.memberCount < 255) {
        await guild.leave()
      }
    })
  }
})
