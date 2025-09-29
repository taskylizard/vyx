import { definePlugin } from '#framework'

const SUBMIT_CHANNEL_ID = '1143161987291947178'
const LINK_RE =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi

export default definePlugin({
  name: 'wotaku',
  onLoad: (client) => {
    client.on('messageCreate', async (message) => {
      if (
        message.channelID === SUBMIT_CHANNEL_ID &&
        !message.author.bot &&
        message.content.match(LINK_RE) !== null
      ) {
        await message.startThread({
          name: 'Discussion 🧵'
        })
      }
    })
  }
})
