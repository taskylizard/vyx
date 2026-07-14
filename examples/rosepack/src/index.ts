import { createApp } from './app.ts'

const token = process.env.DISCORD_TOKEN
if (token === undefined) {
  throw new Error('Set DISCORD_TOKEN before starting the example bot.')
}

await createApp(token).start()
