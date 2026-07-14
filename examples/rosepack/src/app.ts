import { Client, Intents } from 'oceanic.js'
import { commands } from './commands/index.ts'
import { NotesService, type AppContext } from './context.ts'
import { rosepack } from './framework.ts'

/** Creates an Oceanic client and connects rosepack's registry to its lifecycle. */
export function createApp(token: string) {
  const client = new Client({
    auth: `Bot ${token}`,
    gateway: {
      intents: Intents.GUILDS | Intents.DIRECT_MESSAGES
    }
  })
  const registry = rosepack.createRegistry(commands)
  const app: AppContext = {
    client,
    notes: new NotesService()
  }

  client.once('ready', async () => {
    const registered = await registry.registerGlobal({
      applicationID: client.application.id,
      client
    })
    console.info(`Registered ${registered.length} slash commands.`)
  })

  client.on('interactionCreate', async (interaction) => {
    await registry.dispatch({ app, interaction })
  })

  return {
    client,
    registry,
    start: () => client.connect(),
    stop: () => {
      client.disconnect(false)
    }
  }
}
