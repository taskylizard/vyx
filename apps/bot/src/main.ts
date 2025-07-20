import './suppress-node-warnings'
import { cli } from './cli'
import { Client } from './framework'
import { logger } from './framework/utils/logger'

const client = new Client()
cli(client)

await client.start().catch((error) => {
  logger.error(error)
  process.exit(1)
})
