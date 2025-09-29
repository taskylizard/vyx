import { definePlugin } from '#framework'
import { Member, type TextChannel } from 'oceanic.js'

const LOG_CHANNEL = '1297069885393866814'
const GUILD = '785056354673885221'

export default definePlugin({
  name: 'taskyland',
  onLoad: (client) => {
    // Listen for lpeople joining the server
    client.on('guildMemberAdd', async (member) => {
      if (member.guildID !== GUILD) return
      const channel = client.getChannel(LOG_CHANNEL) as TextChannel
      await channel.createMessage({
        content: `Welcome ${member.user.mention} to the server! :tada:`
      })
    })

    client.on('guildMemberRemove', async (member) => {
      if (!(member instanceof Member)) return
      if (member.guildID !== GUILD) return
      const channel = client.getChannel(LOG_CHANNEL)! as TextChannel
      await channel.createMessage({
        content: `Goodbye ${member.user.mention} from the server! :wave:`
      })
    })
  }
})
