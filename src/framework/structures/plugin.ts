import type { Client } from '../client'
import type { Context } from './context'

export type Middleware = (
  ctx: Context,
  next: () => Promise<void> | void
) => Promise<void> | void

/**
 * Interface representing a plugin.
 */
export interface Plugin {
  /**
   * The name of the plugin.
   */
  name: string

  /**
   * Function to be called when the plugin is loaded.
   * @param {Client} client - The client instance.
   * @returns {unknown} The result of the onLoad function.
   */
  onLoad: (client: Client) => unknown

  /**
   * Function to be called when the plugin is unloaded.
   * @param {Client} client - The client instance.
   * @returns {unknown} The result of the onUnload function.
   */
  onUnload?: (client: Client) => unknown

  /**
   * Function to be called when the application exits.
   * @param {Client} client - The client instance.
   * @returns {unknown} The result of the onExit function.
   */
  onExit?: (client: Client) => unknown

  /** Array of middlewares that will run before commands. */
  middlewares?: Middleware[]
}

/**
 * Defines a plugin with the given options.
 * @param {Plugin} options - The options for the plugin.
 * @returns {Plugin} The defined plugin.
 */
export function definePlugin(options: Plugin): Plugin {
  return options
}
