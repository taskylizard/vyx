import type { InteractionsManager } from './interactions';
import type { PluginsManager } from './plugins';

export * from './plugins';
export * from './interactions';

export interface Managers {
  interactions: InteractionsManager;
  plugins: PluginsManager;
}
