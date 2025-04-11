import { defineSlashCommand } from '#framework'
import balance from './balance'
import crime from './crime'
import currency from './currency'
import deposit from './deposit'
import rob from './rob'
import shop from './shop'
import slut from './slut'
import withdraw from './withdraw'
import work from './work'

export default defineSlashCommand({
  name: 'economy',
  moduleId: 'ECONOMY',
  description: 'Server economy.',
  guildOnly: true,
  subcommands: [
    balance,
    crime,
    currency,
    deposit,
    rob,
    slut,
    withdraw,
    work,
    shop
  ]
})
