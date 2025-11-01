import type { ClientEvents } from 'oceanic.js'
import { plugins } from '../../plugins/index'
import type { Client } from '../client'
import type { Middleware, Plugin } from '../structures/plugin'
import { logger } from '../utils/logger'

export class PluginsManager {
  public plugins: Map<string, Plugin>
  public middlewares: Middleware[] = []
  public readonly client: Client

  private pluginsLogger = logger.withTag('PluginsManager')

  public constructor(client: Client) {
    this.client = client
    this.plugins = new Map()

    this.pluginsLogger.debug('Initialized plugins manager.')

    process.on('exit', async (_) => {
      this.pluginsLogger.info('Calling all onExit() methods of plugins...')
      for (const plugin of this.plugins.values()) {
        this.pluginsLogger.debug(`Called ${plugin.name}.onExit()`)
        if (plugin.onExit) await plugin.onExit(this.client)
      }
    })
  }

  public async load(): Promise<void> {
    this.pluginsLogger.debug('Started loading plugins...')
    for (const plugin of Object.keys(plugins)) {
      await this.loadPlugin(plugin as keyof typeof plugins)
    }

    this.pluginsLogger.info(`Loaded ${this.plugins.size} plugins.`)
  }

  public async loadPlugin(
    name: keyof typeof plugins
  ): Promise<Plugin | undefined> {
    const plugin = plugins[name]

    if (this.plugins.has(plugin.name)) {
      this.pluginsLogger.warn(
        `Attempted to load already existing plugin ${plugin.name}`
      )
      throw new Error(`Plugin ${plugin.name} is already loaded.`)
    }

    if (plugin.disabled) {
      this.pluginsLogger.debug(`Skipping disabled plugin ${plugin.name}`)
      return
    }

    await plugin.onLoad(this.client)
    this.plugins.set(plugin.name, plugin)
    if (plugin.middlewares) this.middlewares.push(...plugin.middlewares)
    if (plugin.events) {
      Object.entries(plugin.events).forEach(([event, listener]) => {
        // @ts-expect-error: "Expression produces a union type that is too complex to represent." don't care lmao
        this.client.on(event as keyof ClientEvents, listener)
        this.pluginsLogger.trace(`Registered event listener for ${event}`)
      })
    }
    this.pluginsLogger.debug(`Loaded plugin ${plugin.name}`)

    return plugin
  }
}
