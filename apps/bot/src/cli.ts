import type { Client } from '#framework'
import { generateHelpMessage, parse } from 'ordana'
import type { TopLevelOptions } from 'ordana'
import { logger } from './framework/utils/logger'

const cliOptions: TopLevelOptions = {
  name: 'vyx',
  subcommands: {
    start: {
      description: 'Start the bot',
      arguments: {
        clearCommands: {
          type: 'boolean',
          description: 'Clear all application commands before starting',
          short: 'c'
        },
        forceRegister: {
          type: 'boolean',
          description:
            'Force register all application commands even if unchanged',
          short: 'f'
        }
      }
    }
  },
  defaultSubcommand: 'start'
}

const args = parse(process.argv.slice(2), cliOptions)

if (args.type === 'help') {
  const helpMessage = generateHelpMessage({
    topLevelOptions: args.topLevelOptions,
    targetSubcommand: args.targetSubcommand
  })
  logger.info(helpMessage)
  process.exit(0)
}

export function cli(client: Client) {
  if (args.type === 'normal') {
    client.once('ready', async () => {
      if (args.values.clearCommands) {
        await client.managers.interactions.clearCommands()
      }

      await client.managers.interactions.updateCommands(
        Boolean(args.values.forceRegister)
      )
    })
  }
}
