import { Color, ColorCode, Logger } from '@control.systems/logger';
import { fdir } from 'fdir';
import type {
  ApplicationCommandOptions,
  ApplicationCommandOptionsSubCommand,
  ApplicationCommandOptionsWithValue,
  CreateApplicationCommandOptions,
  CreateUserApplicationCommandOptions
} from 'oceanic.js';
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Collection
} from 'oceanic.js';
import { join } from 'pathe';
import type {
  Client,
  Interaction,
  Option,
  OptionType,
  SlashCommand,
  UserCommand
} from '..';
import { importDefault } from '..';

export class InteractionsManager {
  public handlers: {
    commands: Collection<string, SlashCommand<Option[]>>;
    userCommands: Collection<string, UserCommand>;
    components: Collection<
      string,
      Interaction<'button'> | Interaction<'modal'> | Interaction<'selectMenu'>
    >;
  };
  public readonly client: Client;
  public dir: string;
  public cooldowns: Map<string, Map<string, number>>;

  private logger: Logger;
  private testingGuild = '962733982296997978';

  public constructor(client: Client, dir: string) {
    this.client = client;
    this.handlers = {
      commands: new Collection(),
      userCommands: new Collection(),
      components: new Collection()
    };
    this.logger = new Logger(this.constructor.name);
    this.cooldowns = new Map();
    this.dir = dir;
    this.logger.debug('Initialized interactions manager.');
  }

  public async load(): Promise<void> {
    this.logger.debug(`Started loading interactions from ${this.dir}...`);

    const load = (directory: string) =>
      new fdir().withFullPaths().crawl(join(this.dir, directory));

    const commands = await load('k').withPromise();
    for (const file of commands) await this.loadSlashCommand(file);
    const userCommands = await load('user').withPromise();
    for (const file of userCommands) await this.loadUserCommand(file);
    const components = await load('interactions').withPromise();
    for (const file of components) await this.loadComponentInteraction(file);

    this.logger.info(
      `Loaded: ${this.handlers.commands.size} slash commands • ${this.handlers.userCommands.size} user commands • ${this.handlers.components.size} components`
    );
  }

  private async loadUserCommand(path: string) {
    let cmd: UserCommand;
    try {
      cmd = await importDefault<UserCommand>(path);
      if (this.handlers.userCommands.has(cmd.name)) {
        this.logger.warn(
          `Attempted to load already existing user-command ${cmd.name}`
        );
        throw new Error(`User command ${cmd.name} already exists.`);
      }

      this.handlers.userCommands.set(cmd.name, cmd);
      this.logger.debug(`Loaded user-command ${cmd.name}.`);
      return cmd;
    } catch (error) {
      this.logger.error(`Failed to load user-command ${path}.`, error);
      throw error;
    }
  }

  private async loadSlashCommand(path: string) {
    let cmd: SlashCommand<Option[]>;
    try {
      cmd = await importDefault<SlashCommand<Option[]>>(path);
      if (this.handlers.commands.has(cmd.name)) {
        this.logger.warn(
          `Attempted to load already existing slash-command ${cmd.name}`
        );
        throw new Error(`Slash command ${cmd.name} already exists.`);
      }

      this.handlers.commands.set(cmd.name, cmd);
      this.logger.debug(`Loaded slash-command ${cmd.name}.`);
      return cmd;
    } catch (error) {
      this.logger.error(`Failed to load slash-command ${path}.`, error);
      throw error;
    }
  }

  /**
   * Loads a interaction.
   * @param path interaction path
   * @returns The instance of loaded interaction
   */
  public async loadComponentInteraction(
    path: string
  ): Promise<
    Interaction<'button'> | Interaction<'modal'> | Interaction<'selectMenu'>
  > {
    let component:
      | Interaction<'button'>
      | Interaction<'modal'>
      | Interaction<'selectMenu'>;

    try {
      component = await importDefault<
        Interaction<'button'> | Interaction<'modal'> | Interaction<'selectMenu'>
      >(path);
      if (this.handlers.components.has(component.id)) {
        this.logger.warn(
          `Attempted to load already existing component interaction ${component.id}`
        );
        throw new Error(
          `Component interaction ${component.id} already exists.`
        );
      }

      this.handlers.components.set(component.id, component);
      this.logger.debug(`Loaded component interaction ${component.id}.`);
      return component;
    } catch (error) {
      this.logger.error(`Failed to load component interaction ${path}.`, error);
      throw error;
    }
  }

  public async syncModules() {
    for await (const guild of this.client.guilds.values()) {
      const config = await this.client.prisma.config.findUnique({
        where: { guildId: BigInt(guild.id) },
        select: { modules: true }
      });

      if (!config || config.modules.length === 0) return;

      for await (const mod of config.modules) {
        const command = [...this.handlers.commands.values()].find(
          (command) => command.moduleId === mod
        );

        if (!command) return;
        await this.client.application.createGuildCommand(
          guild.id,
          this.toSlashJson(command)
        );
      }
    }

    this.logger.info('Synced server modules configuration.');
  }

  /**
   * Updates all application commands.
   */
  public async updateCommands(): Promise<void> {
    const slashCommands: CreateApplicationCommandOptions[] = [];
    const guildSlashCommands = new Collection<
      string,
      CreateApplicationCommandOptions[]
    >();
    const userCommandList = [...this.handlers.userCommands.values()].map(
      (command) => this.toUserJson(command)
    );

    try {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.info(
          `Running in ${Color.get(ColorCode.RED)('development')} mode, syncing to guild...`
        );

        const commandData = this.handlers.commands
          .filter((command) => !command.moduleId)
          .filter((command) => !command.disabled)
          .map((command) => this.toSlashJson(command));

        await this.client.application
          .bulkEditGuildCommands(this.testingGuild, [
            ...commandData,
            ...userCommandList
          ])
          .catch(this.logger.error);
      } else {
        // Production

        this.logger.info(
          `Running in ${Color.get(ColorCode.BRIGHT_GREEN)('production')} mode.`
        );

        // Map over them for Global and Guild commands.
        for (const command of this.handlers.commands
          .filter((command) => !command.moduleId)
          .filter((command) => !command.disabled)
          .values()) {
          if (
            !command.guilds ||
            typeof command.guilds === 'undefined' ||
            command.guilds.length === 0
          ) {
            // Global commands
            slashCommands.push(this.toSlashJson(command));
          } else {
            // Guild commands
            for (const id of command.guilds!) {
              if (!guildSlashCommands.has(id)) guildSlashCommands.set(id, []);
              guildSlashCommands.get(id)!.push(this.toSlashJson(command));
            }
          }
        }

        // Then bulk set every one.
        await this.client.application
          .bulkEditGlobalCommands([...slashCommands, ...userCommandList])
          .catch(this.logger.error);

        // Bulk setting Guild commands.
        for (const [id, guildCommandData] of guildSlashCommands.entries()) {
          const guild =
            this.client.guilds.get(id) ??
            (await this.client.rest.guilds.get(id));

          if (guild) {
            await this.client.application
              .bulkEditGuildCommands(guild.id, guildCommandData)
              .catch(this.logger.error);
          } else {
            this.logger.warn(
              `No guild was found by the ID of ${id}. Slash commands will not be set for this guild.`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to update application commands.', error);
    }

    this.logger.info(
      `Updated all ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands.`
    );

    await this.syncModules();
  }

  public toSlashJson(
    command: SlashCommand<Option[]>
  ): CreateApplicationCommandOptions {
    let options: ApplicationCommandOptions[] = [];
    if (command.subcommands) {
      for (const subcommand of command.subcommands) {
        // If the subcommand has nested subcommands
        if (subcommand.subcommands) {
          const suboptions: ApplicationCommandOptionsSubCommand[] = [];

          for (const subsubcommand of subcommand.subcommands) {
            suboptions.push({
              name: subsubcommand.name,
              description: subsubcommand.description!,
              type: ApplicationCommandOptionTypes.SUB_COMMAND,
              options: this.mapOptions(subsubcommand.options)
            });
          }
          options.push({
            name: subcommand.name,
            description: subcommand.description!,
            type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP,
            options: suboptions
          });
        } else {
          options.push({
            name: subcommand.name,
            description: subcommand.description!,
            type: ApplicationCommandOptionTypes.SUB_COMMAND,
            options: this.mapOptions(subcommand.options)
          });
        }
      }
    } else if (command.options) options = this.mapOptions(command.options);

    return {
      type: ApplicationCommandTypes.CHAT_INPUT,
      name: command.name,
      description: command.description!,
      options: options,
      integrationTypes: command.integrationTypes,
      nsfw: command.nsfw,
      contexts: command.contexts,
      defaultMemberPermissions: command.defaultMemberPermissions
    };
  }

  private toUserJson(
    command: UserCommand
  ): CreateUserApplicationCommandOptions {
    return {
      type: ApplicationCommandTypes.USER,
      name: command.name,
      integrationTypes: command.integrationTypes,
      nsfw: command.nsfw,
      defaultMemberPermissions: command.defaultMemberPermissions,
      id: command.id,
      contexts: command.contexts,
      nameLocalizations: command.nameLocalizations
    };
  }

  private mapOptions(
    options: Option[] | undefined
  ): ApplicationCommandOptionsWithValue[] {
    if (!options) return [];
    const _options = [];
    for (const option of options) {
      _options.push({
        name: option.name,
        type: this.toOptionType(option.type),
        description: option.description,
        required: option.required ?? false
      });
    }

    // @ts-expect-error
    return _options;
  }

  private toOptionType(type: OptionType) {
    switch (type) {
      case 'boolean':
        return ApplicationCommandOptionTypes.BOOLEAN;
      case 'string':
        return ApplicationCommandOptionTypes.STRING;
      case 'integer':
        return ApplicationCommandOptionTypes.INTEGER;
      case 'number':
        return ApplicationCommandOptionTypes.NUMBER;
      case 'user':
        return ApplicationCommandOptionTypes.USER;
      case 'role':
        return ApplicationCommandOptionTypes.ROLE;
      case 'channel':
        return ApplicationCommandOptionTypes.CHANNEL;
      case 'snowflake':
        return ApplicationCommandOptionTypes.INTEGER;
      case 'attachment':
        return ApplicationCommandOptionTypes.ATTACHMENT;
    }
  }
}
