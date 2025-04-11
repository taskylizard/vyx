import 'dotenv/config'
import './suppress-node-warnings'
import { cli } from './cli'
import { Client } from './framework'

const client = new Client()
cli(client)

await client.start().catch((error) => {
  console.error(error)
  process.exit(1)
})
