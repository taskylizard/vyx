import type { InteractionsManager } from './interactions'
import type { PluginsManager } from './plugins'
import type { PrefixCommandsManager } from './prefix-commands'

export * from './interactions'
export * from './plugins'
export * from './prefix-commands'

export interface Managers {
  interactions: InteractionsManager
  plugins: PluginsManager
  prefixCommands: PrefixCommandsManager
}
