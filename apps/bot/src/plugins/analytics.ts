import { definePlugin } from '#framework'

export default definePlugin({
  name: 'Analytics',
  disabled: process.env.NODE_ENV === 'development',
  onLoad(client) {
    setInterval(async () => {
      if (client.modules.analytics) {
        await client.modules.analytics.writeStats()
      }
    }, 20_000)
  }
})
