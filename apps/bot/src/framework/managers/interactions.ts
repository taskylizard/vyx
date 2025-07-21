import type {
  ApplicationCommandOptions,
  ApplicationCommandOptionsSubCommand,
  ApplicationCommandOptionsWithValue,
  CreateApplicationCommandOptions,
  CreateGuildApplicationCommandOptions,
  CreateUserApplicationCommandOptions
} from 'oceanic.js'
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Collection
} from 'oceanic.js'
import { Color, ColorCode, Logger } from 'tracix'
import AvatarUserCommand from '../../user/avatar'
import ReportUserCommand from '../../user/report'
import {
  type Client,
  type CommandOptions,
  createGuard,
  type InteractionUnion,
  type SlashCommand,
  type SubCommandOptions,
  type UserCommand
} from '../index'

const userCommands = {
  avatar: AvatarUserCommand,
  report: ReportUserCommand
} as const

import { slashCommands } from '../../commands'
import ReminderResolveInteraction from '../../interactions/reminder/resolve'
import ReminderSubmitInteraction from '../../interactions/reminder/submit'
import ReportCreateInteraction from '../../interactions/report/create'
import ReportResolveInteraction from '../../interactions/report/resolve'

const interactions = {
  'reminder.resolve': ReminderResolveInteraction,
  'reminder.submit': ReminderSubmitInteraction,
  'report.create': ReportCreateInteraction,
  'report.resolve': ReportResolveInteraction
} as const

export class InteractionsManager {
  public handlers: {
    commands: Collection<string, SlashCommand>
    userCommands: Collection<string, UserCommand>
    components: Collection<string, InteractionUnion>
  }
  public readonly client: Client
  public cooldowns: Map<string, Map<string, number>>

  private logger: Logger
  private testingGuild = '962733982296997978'

  public constructor(client: Client) {
    this.client = client
    this.handlers = {
      commands: new Collection(),
      userCommands: new Collection(),
      components: new Collection()
    }
    this.logger = new Logger(this.constructor.name)
    this.cooldowns = new Map()
    this.logger.debug('Initialized interactions manager.')
  }

  public load(): void {
    this.logger.debug('Started loading interactions...')

    for (const command of Object.keys(slashCommands))
      this.loadSlashCommand(command as keyof typeof slashCommands)
    for (const command of Object.keys(userCommands))
      this.loadUserCommand(command as keyof typeof userCommands)
    for (const interaction of Object.keys(interactions))
      this.loadComponentInteraction(interaction as keyof typeof interactions)

    this.logger.info(
      `Loaded: ${this.handlers.commands.size} slash commands • ${this.handlers.userCommands.size} user commands • ${this.handlers.components.size} components`
    )
  }

  private loadUserCommand(path: keyof typeof userCommands) {
    let cmd: UserCommand
    try {
      cmd = userCommands[path]
      if (this.handlers.userCommands.has(cmd.name)) {
        this.logger.warn(
          `Attempted to load already existing user-command ${cmd.name}`
        )
        throw new Error(`User command ${cmd.name} already exists.`)
      }

      this.handlers.userCommands.set(cmd.name, cmd)
      this.logger.debug(`Loaded user-command ${cmd.name}.`)
      return cmd
    } catch (error) {
      this.logger.error(`Failed to load user-command ${path}.`, error)
      throw error
    }
  }

  private loadSlashCommand(command: keyof typeof slashCommands) {
    let cmd: SlashCommand | SlashCommand[]
    // Typeguard for single slash command
    const isSingleCommand = createGuard((cmd: SlashCommand | SlashCommand[]) =>
      Array.isArray(cmd) ? undefined : cmd
    )
    try {
      cmd = slashCommands[command]
      if (isSingleCommand(cmd)) {
        if (this.handlers.commands.has(cmd.name)) {
          this.logger.error(
            `Attempted to load already existing slash-command ${cmd.name}`
          )
          throw new Error(`Slash command ${cmd.name} already exists.`)
        }

        if (!cmd.disabled) {
          this.handlers.commands.set(cmd.name, cmd)
          this.logger.debug(`Loaded slash-command ${cmd.name}.`)
          return cmd
        }
      } else {
        for (const command of cmd) {
          if (this.handlers.commands.has(command.name)) {
            this.logger.warn(
              `Attempted to load already existing slash-command ${command.name}`
            )
            throw new Error(`Slash command ${command.name} already exists.`)
          }

          if (!command.disabled) {
            this.handlers.commands.set(command.name, command)
            this.logger.debug(`Loaded slash-command ${command.name}.`)
            return command
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load slash-command ${command}.`, error)
      throw error
    }
  }

  /**
   * Loads a interaction.
   * @param command interaction path
   * @returns The instance of loaded interaction
   */
  public loadComponentInteraction(
    command: keyof typeof interactions
  ): InteractionUnion {
    let component: InteractionUnion

    try {
      component = interactions[command]
      if (this.handlers.components.has(component.id)) {
        this.logger.warn(
          `Attempted to load already existing component interaction ${component.id}`
        )
        throw new Error(`Component interaction ${component.id} already exists.`)
      }

      this.handlers.components.set(component.id, component)
      this.logger.debug(`Loaded component interaction ${component.id}.`)
      return component
    } catch (error) {
      this.logger.error(
        `Failed to load component interaction ${command}.`,
        error
      )
      throw error
    }
  }

  public async syncModules() {
    const guilds = [...this.client.guilds.values()]

    for (const guild of guilds) {
      const config = await this.client.prisma.config.findUnique({
        where: { guildId: BigInt(guild.id) },
        select: { modules: true }
      })

      if (!config || config.modules.length === 0) return

      for await (const mod of config.modules) {
        const command = [...this.handlers.commands.values()].find(
          (command) => command.moduleId === mod
        )

        if (!command) return
        await this.client.application.createGuildCommand(
          guild.id,
          this.toSlashJson(command) as CreateGuildApplicationCommandOptions
        )
      }
    }

    this.logger.info('Synced server modules configuration.')
  }

  /**
   * Updates all application commands.
   * @param forceRegister Whether to force register commands, bypassing the cache check
   */
  public async updateCommands(forceRegister = false): Promise<void> {
    const slashCommands: CreateApplicationCommandOptions[] = []
    const guildSlashCommands = new Collection<
      string,
      CreateApplicationCommandOptions[]
    >()
    const userCommandList = [...this.handlers.userCommands.values()].map(
      (command) => this.toUserJson(command)
    )

    try {
      if (this.client.env.NODE_ENV !== 'production') {
        this.logger.info(
          `Running in ${Color.get(ColorCode.RED)('development')} mode, syncing to guild...`
        )

        const commandData = this.handlers.commands
          .filter((command) => !command.moduleId)
          .filter((command) => !command.disabled)
          .map((command) => this.toSlashJson(command))

        await this.client.application
          .bulkEditGuildCommands(this.testingGuild, [
            ...commandData,
            ...userCommandList
          ] as CreateGuildApplicationCommandOptions[])
          .catch(this.logger.error)
      } else {
        // Production
        this.logger.info(
          `Running in ${Color.get(ColorCode.BRIGHT_GREEN)('production')} mode.`
        )

        // Map over them for Global and Guild commands.
        for (const command of this.handlers.commands
          .filter((command) => !command.moduleId)
          .filter((command) => !command.disabled)
          .values()) {
          if (!command.guilds || command.guilds.length === 0) {
            // Global commands
            slashCommands.push(this.toSlashJson(command))
          } else {
            // Guild commands
            for (const id of command.guilds) {
              if (!guildSlashCommands.has(id)) {
                guildSlashCommands.set(id, [])
              }
              const commands = guildSlashCommands.get(id)
              if (commands) {
                commands.push(this.toSlashJson(command))
              }
            }
          }
        }

        // Register all commands, since we're either forcing it or not using the cache
        this.logger.info(
          forceRegister
            ? 'Force registration enabled, registering all commands.'
            : 'Registering all commands.'
        )

        // Then bulk set every one.
        await this.client.application.bulkEditGlobalCommands([
          ...slashCommands,
          ...userCommandList
        ])

        // Bulk setting Guild commands.
        for (const [id, guildCommandData] of guildSlashCommands.entries()) {
          const guild =
            this.client.guilds.get(id) ??
            (await this.client.rest.guilds.get(id))

          if (guild) {
            await this.client.application
              .bulkEditGuildCommands(
                guild.id,
                guildCommandData as CreateGuildApplicationCommandOptions[]
              )
              .catch(this.logger.error)
          } else {
            this.logger.warn(
              `No guild was found by the ID of ${id}. Slash commands will not be set for this guild.`
            )
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to update application commands:', error)
    }

    this.logger.info(
      `Updated all ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands.`
    )

    return await this.syncModules()
  }

  /**
   * Clears all application commands globally and in test guild
   */
  public async clearCommands(): Promise<void> {
    try {
      this.logger.info('Clearing all application commands...')

      // Clear global commands
      await this.client.application
        .bulkEditGlobalCommands([])
        .catch(this.logger.error)

      // Clear commands in testing guild
      if (this.testingGuild) {
        await this.client.application
          .bulkEditGuildCommands(this.testingGuild, [])
          .catch(this.logger.error)
      }

      // Also clear commands in all guilds where we have custom commands
      const guilds = [...this.client.guilds.values()]
      for (const guild of guilds) {
        await this.client.application
          .bulkEditGuildCommands(guild.id, [])
          .catch((error) => {
            this.logger.error(
              `Failed to clear commands in guild ${guild.id}:`,
              error
            )
          })
      }

      this.logger.info(
        'All application commands have been cleared successfully.'
      )
    } catch (error) {
      this.logger.error('Failed to clear application commands:', error)
      throw error
    }
  }

  public toSlashJson(command: SlashCommand): CreateApplicationCommandOptions {
    let options: ApplicationCommandOptions[] = []
    if (command.subcommands) {
      for (const subcommand of command.subcommands) {
        // If the subcommand has nested subcommands
        if (subcommand.subcommands) {
          const suboptions: ApplicationCommandOptionsSubCommand[] = []

          for (const subsubcommand of subcommand.subcommands) {
            suboptions.push({
              name: subsubcommand.name,
              description: subsubcommand.description,
              type: ApplicationCommandOptionTypes.SUB_COMMAND,
              options: this.normalizeSubcommandOptions(subsubcommand.options)
            })
          }
          options.push({
            name: subcommand.name,
            description: subcommand.description,
            type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP,
            options: suboptions
          })
        } else {
          options.push({
            name: subcommand.name,
            description: subcommand.description,
            type: ApplicationCommandOptionTypes.SUB_COMMAND,
            options: this.normalizeSubcommandOptions(subcommand.options)
          })
        }
      }
    } else if (command.options) {
      options = this.normalizeCommandOptions(command.options)
    }

    return {
      type: ApplicationCommandTypes.CHAT_INPUT,
      name: command.name,
      description: command.description,
      options: options,
      integrationTypes: command.integrationTypes,
      nsfw: command.nsfw,
      contexts: command.contexts,
      defaultMemberPermissions: command.defaultMemberPermissions
    }
  }

  /**
   * Normalize command options by converting string types to their numeric equivalents
   */
  private normalizeCommandOptions(
    options?: CommandOptions
  ): ApplicationCommandOptions[] {
    if (!options) return []

    return Object.entries(options).map(([optionName, optionData]) => {
      // Create a new object that always has a name property from the object key
      const opt: Record<string, any> = { ...optionData, name: optionName }

      if (typeof opt.type === 'string') {
        const typeMap: Record<string, ApplicationCommandOptionTypes> = {
          string: ApplicationCommandOptionTypes.STRING,
          integer: ApplicationCommandOptionTypes.INTEGER,
          boolean: ApplicationCommandOptionTypes.BOOLEAN,
          user: ApplicationCommandOptionTypes.USER,
          channel: ApplicationCommandOptionTypes.CHANNEL,
          role: ApplicationCommandOptionTypes.ROLE,
          mentionable: ApplicationCommandOptionTypes.MENTIONABLE,
          number: ApplicationCommandOptionTypes.NUMBER,
          attachment: ApplicationCommandOptionTypes.ATTACHMENT,
          sub_command: ApplicationCommandOptionTypes.SUB_COMMAND,
          sub_command_group: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
        }
        opt.type = typeMap[opt.type] ?? ApplicationCommandOptionTypes.STRING
      }
      return opt as ApplicationCommandOptions
    })
  }

  /**
   * Normalize subcommand options by converting string types to their numeric equivalents
   */
  private normalizeSubcommandOptions(
    options?: SubCommandOptions
  ): ApplicationCommandOptionsWithValue[] {
    if (!options) return []

    return Object.entries(options).map(([optionName, optionData]) => {
      // Create a new object that always has a name property from the object key
      const opt: Record<string, any> = { ...optionData, name: optionName }

      if (typeof opt.type === 'string') {
        const typeMap: Record<string, ApplicationCommandOptionTypes> = {
          string: ApplicationCommandOptionTypes.STRING,
          integer: ApplicationCommandOptionTypes.INTEGER,
          boolean: ApplicationCommandOptionTypes.BOOLEAN,
          user: ApplicationCommandOptionTypes.USER,
          channel: ApplicationCommandOptionTypes.CHANNEL,
          role: ApplicationCommandOptionTypes.ROLE,
          mentionable: ApplicationCommandOptionTypes.MENTIONABLE,
          number: ApplicationCommandOptionTypes.NUMBER,
          attachment: ApplicationCommandOptionTypes.ATTACHMENT
        }
        opt.type = typeMap[opt.type] ?? ApplicationCommandOptionTypes.STRING
      }
      return opt as ApplicationCommandOptionsWithValue
    })
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
    }
  }
}