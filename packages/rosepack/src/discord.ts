import consola from 'consola'
import { Client } from 'oceanic.js'
import { createError, ctx } from './rosepack'
import type { Rosepack, RuntimeRosepack } from './types'
import { toJSON } from './utils'

export const initCient = (rosepackOptions: Rosepack['options']) => {
  try {
    const client = new Client({
      auth: `Bot ${process.env.DISCORD_CLIENT_TOKEN}`,
      ...rosepackOptions.client
    })

    client.connect()

    return client
  } catch (error: unknown) {
    createError(error instanceof Error ? error.message : String(error))
  }
}

export const refreshApplicationCommands = async (rosepack: Rosepack) => {
  const commands = [
    ...rosepack.commands.map((cmd) => cmd),
    ...rosepack.contextMenus.map((cmd) => cmd)
  ]

  rosepack.client?.once('ready', async () => {
    try {
      consola.info('Started refreshing application commands.')

      const commandData = commands.map((cmd) => toJSON(cmd))

      const apiCommands = await rosepack.client!.rest.applications
        .bulkEditGlobalCommands(
          rosepack.options.clientId || rosepack.client!.application.id,
          commandData
        )

      consola.info('Syncing commands with API.')
      for (const cmd of commands) {
        const command = apiCommands.find((c) => c.name === cmd.config.name)

        if (!command) {
          consola.warn(`Command \`${cmd.config.name}\` not found in API.`)
          continue
        }
        cmd.config.id = command.id
      }
      consola.success('Successfully loaded application commands.\n')
      const readyEvents = rosepack.events.filter(
        (event) => event.config.name === 'ready'
      )

      if (readyEvents.length > 0) {
        for (const readyEvent of readyEvents) {
          ctx.call(rosepack as RuntimeRosepack, () => readyEvent.callback())
        }
      }
    } catch (error: unknown) {
      createError(error instanceof Error ? error.message : String(error))
    }
  })
}
