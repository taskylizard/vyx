import { defineSlashCommand } from '#framework'
import shopBuy from './buy'
import shopCreate from './create'
import shopDelete from './delete'
import shopList from './list'

export default defineSlashCommand({
  name: 'shop',
  description: 'Server shop commands.',
  subcommands: [shopBuy, shopList, shopCreate, shopDelete]
})
