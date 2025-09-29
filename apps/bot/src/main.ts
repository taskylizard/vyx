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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully')
  process.exit(0)
})
