import { Logger } from '@control.systems/logger';
import { fdir } from 'fdir';
import { join } from 'pathe';
import type { Client } from '../client';
import type { Middleware, Plugin } from '../structures/plugin';
import { importDefault } from '../utils/common';

export class PluginsManager {
  public plugins: Map<string, Plugin>;
  public middlewares: Middleware[] = [];
  public readonly client: Client;
  public dir: string;

  private logger: Logger;

  public constructor(client: Client, dir: string) {
    this.client = client;
    this.plugins = new Map();
    this.logger = new Logger(this.constructor.name);
    this.dir = dir;

    this.logger.debug('Initialized plugins manager.');

    process.on('exit', async (_) => {
      this.logger.info('Calling all onExit() methods of plugins...');
      for (const plugin of this.plugins.values()) {
        this.logger.debug(`Called ${plugin.name}.onExit()`);
        plugin.onExit && (await plugin.onExit(this.client));
      }
    });
  }

  public async load(): Promise<void> {
    this.logger.debug(`Started loading plugins from ${this.dir}...`);
    const load = (directory: string) =>
      new fdir().withFullPaths().crawl(join(this.dir, directory));

    const files = await load('plugins').withPromise();

    for (const file of files) await this.loadPlugin(file);

    this.logger.info(`Loaded ${this.plugins.size} plugins.`);
  }

  public async loadPlugin(path: string): Promise<Plugin | undefined> {
    let plugin: Plugin;
    try {
      plugin = await importDefault<Plugin>(path);

      if (this.plugins.has(plugin.name)) {
        this.logger.warn(
          `Attempted to load already existing plugin ${plugin.name}`
        );
        throw new Error(`Plugin ${plugin.name} is already loaded.`);
      }

      await plugin.onLoad(this.client);
      this.plugins.set(plugin.name, plugin);
      plugin.middlewares && this.middlewares.push(...plugin.middlewares);

      this.logger.debug(`Loaded plugin ${plugin.name}`);

      return plugin;
    } catch (error) {
      this.logger.error(`Failed to load plugin ${path}.`, error);
    }
  }
}
