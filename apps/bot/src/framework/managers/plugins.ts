import type { ClientEvents } from 'oceanic.js'
import { Logger } from 'tracix'
import AdventOfCodePlugin from '../../plugins/adventofcode'
import AnalyticsPlugin from '../../plugins/analytics'
import EventsPlugin from '../../plugins/events'
import PrivateersclubPlugin from '../../plugins/privateersclub'
import TaskylandPlugin from '../../plugins/taskyland'
import WotakuPlugin from '../../plugins/wotaku'
import type { Client } from '../client'
import type { Middleware, Plugin } from '../structures/plugin'

const plugins = {
  adventofcode: AdventOfCodePlugin,
  analytics: AnalyticsPlugin,
  events: EventsPlugin,
  privateersclub: PrivateersclubPlugin,
  taskyland: TaskylandPlugin,
  wotaku: WotakuPlugin
} as const

export class PluginsManager {
  public plugins: Map<string, Plugin>
  public middlewares: Middleware[] = []
  public readonly client: Client

  private logger: Logger

  public constructor(client: Client) {
    this.client = client
    this.plugins = new Map()
    this.logger = new Logger(this.constructor.name)

    this.logger.debug('Initialized plugins manager.')

    process.on('exit', async (_) => {
      this.logger.info('Calling all onExit() methods of plugins...')
      for (const plugin of this.plugins.values()) {
        this.logger.debug(`Called ${plugin.name}.onExit()`)
        plugin.onExit && (await plugin.onExit(this.client))
      }
    })
  }

  public async load(): Promise<void> {
    this.logger.debug('Started loading plugins...')
    for (const plugin of Object.keys(plugins))
      await this.loadPlugin(plugin as keyof typeof plugins)

    this.logger.info(`Loaded ${this.plugins.size} plugins.`)
  }

  public async loadPlugin(
    name: keyof typeof plugins
  ): Promise<Plugin | undefined> {
    const plugin = plugins[name]

    if (this.plugins.has(plugin.name)) {
      this.logger.warn(
        `Attempted to load already existing plugin ${plugin.name}`
      )
      throw new Error(`Plugin ${plugin.name} is already loaded.`)
    }

    if (plugin.disabled) {
      this.logger.debug(`Skipping disabled plugin ${plugin.name}`)
      return
    }

    await plugin.onLoad(this.client)
    this.plugins.set(plugin.name, plugin)
    plugin.middlewares && this.middlewares.push(...plugin.middlewares)
    plugin.events &&
      Object.entries(plugin.events).forEach(([event, listener]) => {
        // @ts-expect-error: "Expression produces a union type that is too complex to represent." don't care lmao
        this.client.on(event as keyof ClientEvents, listener)
        this.logger.trace(`Registered event listener for ${event}`)
      })
    this.logger.debug(`Loaded plugin ${plugin.name}`)

    return plugin
  }
}