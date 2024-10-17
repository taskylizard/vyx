import { Database } from 'bun:sqlite'
import { Client } from 'revolt.js'

const db = new Database('revcord.sqlite')

interface Mapping {
  id: number
  discordChannel: string
  revoltChannel: string
  discordChannelName: string
  revoltChannelName: string
  allowBots: 0 | 1
  updatedAt: string
  createdAt: string
}

export function exportAll() {
  const all: Mapping[] = db
    .query('SELECT * from mappings')
    .all() as unknown as unknown[] as Mapping[]

  console.info(all)
  Bun.write('export.json', JSON.stringify(all, null, 2))
  db.close()
}

const exports = (await Bun.file('export.json').json()) as Mapping[]

const revolt = new Client({ baseURL: 'https://divolt.xyz/api' })

await revolt.loginBot(Bun.env.DIVOLT_TOKEN!)
const freshExports: Mapping[] = []

revolt.on('ready', async () => {
  for await (const mapping of exports) {
    if (await revolt.api.get('-/channels/{target}', mapping.revoltChannel)) {
      freshExports.push(mapping)
    }
    // lmao How do I disxcnnect
    Bun.write('freshExports.json', JSON.stringify(freshExports, null, 2))
    process.exit()
  }
})
