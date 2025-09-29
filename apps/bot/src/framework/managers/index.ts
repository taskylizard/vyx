import type { InteractionsManager } from './interactions'
import type { PluginsManager } from './plugins'

export * from './interactions'
export * from './plugins'

export interface Managers {
  interactions: InteractionsManager
  plugins: PluginsManager
}
