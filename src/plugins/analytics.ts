import { definePlugin } from '#framework'

export default definePlugin({
  name: 'Analytics',
  onLoad(client) {
    if (client.config.env !== 'production') return
    setInterval(async () => {
      await client.modules.analytics.writeStats()
    }, 20_000)
  }
})
