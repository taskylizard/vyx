import { defineRosepackConfig } from '../src'

export default defineRosepackConfig({
  client: {
    gateway: {
      intents: ['GUILDS', 'ALL']
    }
  }
})
