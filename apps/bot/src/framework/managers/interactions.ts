import { colorize } from 'consola/utils'
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
import AvatarUserCommand from '../../user/avatar'
import ReportUserCommand from '../../user/report'
import {
  type Client,
  type ComponentInteractionHandler,
  createGuard,
  error,
  modules,
  ok,
  type Result,
  type SlashCommand,
  type UserCommand
} from '../index'
import { logger } from '../utils/logger'

const userCommands = {
  avatar: AvatarUserCommand,
  report: ReportUserCommand
} as const

import { capitalize } from '@antfu/utils'
import type { Module } from '@packages/database'
import { slashCommands } from '../../commands'
import ReminderResolveInteraction from '../../interactions/reminder/resolve'
import ReminderSubmitInteraction from '../../interactions/reminder/submit'
import ReportCreateInteraction from '../../interactions/report/create'
import ReportResolveInteraction from '../../interactions/report/resolve'
import SupportResolveInteraction from '../../interactions/support/resolved'

const interactions = {
  'reminder.resolve': ReminderResolveInteraction,
  'reminder.submit': ReminderSubmitInteraction,
  'report.create': ReportCreateInteraction,
  'report.resolve': ReportResolveInteraction,
  'support.resolved': SupportResolveInteraction
} as const

export class InteractionsManager {
  public handlers: {
    commands: Collection<string, SlashCommand>
    userCommands: Collection<string, UserCommand>
    components: Collection<string, ComponentInteractionHandler>
  }
  public readonly client: Client
  public cooldowns: Map<string, Map<string, number>>

  private interactionsLogger = logger.withTag('InteractionsManager')
  private get testingGuild(): string {
    return this.client.env.TESTING_GUILD_ID || '962733982296997978'
  }

  public constructor(client: Client) {
    this.client = client
    this.handlers = {
      commands: new Collection(),
      userCommands: new Collection(),
      components: new Collection()
    }
    this.cooldowns = new Map()
    this.interactionsLogger.debug('Initialized interactions manager.')
  }

  public load(): void {
    this.interactionsLogger.debug('Started loading interactions...')

    for (const command of Object.keys(slashCommands)) {
      this.loadSlashCommand(command as keyof typeof slashCommands)
    }
    for (const command of Object.keys(userCommands)) {
      this.loadUserCommand(command as keyof typeof userCommands)
    }
    for (const interaction of Object.keys(interactions)) {
      this.loadComponentInteraction(interaction as keyof typeof interactions)
    }

    this.interactionsLogger.info(
      `Loaded: ${this.handlers.commands.size} slash commands • ${this.handlers.userCommands.size} user commands • ${this.handlers.components.size} components`
    )
  }

  private loadUserCommand(path: keyof typeof userCommands) {
    let cmd: UserCommand
    try {
      cmd = userCommands[path]
      if (this.handlers.userCommands.has(cmd.name)) {
        this.interactionsLogger.warn(
          `Attempted to load already existing user-command ${cmd.name}`
        )
        throw new Error(`User command ${cmd.name} already exists.`)
      }

      this.handlers.userCommands.set(cmd.name, cmd)
      this.interactionsLogger.debug(`Loaded user-command ${cmd.name}.`)
      return cmd
    } catch (error) {
      this.interactionsLogger.error(
        `Failed to load user-command ${path}.`,
        error
      )
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
          this.interactionsLogger.error(
            `Attempted to load already existing slash-command ${cmd.name}`
          )
          throw new Error(`Slash command ${cmd.name} already exists.`)
        }

        if (!cmd.disabled) {
          this.handlers.commands.set(cmd.name, cmd)
          this.interactionsLogger.debug(`Loaded slash-command ${cmd.name}.`)
          return cmd
        }
      } else {
        for (const command of cmd) {
          if (this.handlers.commands.has(command.name)) {
            this.interactionsLogger.warn(
              `Attempted to load already existing slash-command ${command.name}`
            )
            throw new Error(`Slash command ${command.name} already exists.`)
          }

          if (!command.disabled) {
            this.handlers.commands.set(command.name, command)
            this.interactionsLogger.debug(
              `Loaded slash-command ${command.name}.`
            )
            return command
          }
        }
      }
    } catch (error) {
      this.interactionsLogger.error(
        `Failed to load slash-command ${command.toString()}.`,
        error
      )
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
  ): ComponentInteractionHandler {
    let component: ComponentInteractionHandler

    try {
      component = interactions[command] as ComponentInteractionHandler
      if (this.handlers.components.has(component.id)) {
        this.interactionsLogger.warn(
          `Attempted to load already existing component interaction ${component.id}`
        )
        throw new Error(
          `Component interaction ${component.id} already exists.`
        )
      }

      this.handlers.components.set(component.id, component)
      this.interactionsLogger.debug(
        `Loaded component interaction ${component.id}.`
      )
      return component
    } catch (error) {
      this.interactionsLogger.error(
        `Failed to load component interaction ${command}.`,
        error
      )
      throw error
    }
  }

  /**
   * Updates all application commands with Result type error handling.
   * @param forceRegister Whether to force register commands, bypassing the cache check
   */
  public async updateCommands(forceRegister = false): Promise<Result<string>> {
    try {
      const slashCommands: CreateApplicationCommandOptions[] = []
      const guildSlashCommands = new Collection<
        string,
        CreateApplicationCommandOptions[]
      >()
      const userCommandList = [...this.handlers.userCommands.values()].map(
        (command) => this.toUserJson(command)
      )

      if (this.client.env.NODE_ENV !== 'production') {
        this.interactionsLogger.info(
          `Running in ${
            colorize('red', 'development')
          } mode, syncing to guild...`
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
          .catch(this.interactionsLogger.error)
      } else {
        // Production logic...
        this.interactionsLogger.info(
          `Running in ${colorize('greenBright', 'production')} mode.`
        )

        // Map over them for Global and Guild commands.
        for (
          const command of this.handlers.commands
            .filter((command) => !command.moduleId)
            .filter((command) => !command.disabled)
            .values()
        ) {
          if (command.guilds && command.guilds.length > 0) {
            // Guild commands - register only to specified guilds
            for (const id of command.guilds) {
              if (!guildSlashCommands.has(id)) {
                guildSlashCommands.set(id, [])
              }
              const commands = guildSlashCommands.get(id)
              if (commands) {
                commands.push(this.toSlashJson(command))
              }
            }
          } else {
            // Global commands - only if no guilds specified
            slashCommands.push(this.toSlashJson(command))
          }
        }

        // Register all commands
        this.interactionsLogger.info(
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
          const guild = this.client.guilds.get(id) ??
            (await this.client.rest.guilds.get(id))

          if (guild) {
            await this.client.application
              .bulkEditGuildCommands(
                guild.id,
                guildCommandData as CreateGuildApplicationCommandOptions[]
              )
              .catch(this.interactionsLogger.error)
          } else {
            this.interactionsLogger.warn(
              `No guild was found by the ID of ${id}. Slash commands will not be set for this guild.`
            )
          }
        }
      }

      this.interactionsLogger.info(
        `Updated all ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands.`
      )

      const syncResult = await this.syncModules()
      if (!syncResult.ok) {
        return error(
          `Command update succeeded but module sync failed: ${syncResult.error}`
        )
      }

      return ok(
        `Successfully updated ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands`
      )
    } catch (err) {
      this.interactionsLogger.error(
        'Failed to update application commands:',
        err
      )
      return error(
        `Failed to update application commands: ${(err as Error).message}`
      )
    }
  }

  /**
   * Clears all application commands globally and in test guild
   */
  public async clearCommands(): Promise<void> {
    try {
      this.interactionsLogger.info('Clearing all application commands...')

      // Clear global commands
      await this.client.application
        .bulkEditGlobalCommands([])
        .catch(this.interactionsLogger.error)

      // Clear commands in testing guild
      if (this.testingGuild) {
        await this.client.application
          .bulkEditGuildCommands(this.testingGuild, [])
          .catch(this.interactionsLogger.error)
      }

      // Also clear commands in all guilds where we have custom commands
      const guilds = [...this.client.guilds.values()]
      for (const guild of guilds) {
        await this.client.application
          .bulkEditGuildCommands(guild.id, [])
          .catch((error) => {
            this.interactionsLogger.error(
              `Failed to clear commands in guild ${guild.id}:`,
              error
            )
          })
      }

      this.interactionsLogger.info(
        'All application commands have been cleared successfully.'
      )
    } catch (error) {
      this.interactionsLogger.error(
        'Failed to clear application commands:',
        error
      )
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
              options: subsubcommand
                .options as ApplicationCommandOptionsWithValue[]
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
            options: subcommand.options as ApplicationCommandOptionsWithValue[]
          })
        }
      }
    } else if (command.options) {
      options = command.options
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

  private async ensureConfig(guildId: string) {
    let config = await this.client.prisma.config.findUnique({
      where: { guildId: BigInt(guildId) }
    })
    if (!config) {
      config = await this.client.prisma.config.create({
        data: { guildId: BigInt(guildId), modules: [] }
      })
    }
    return config
  }

  public async toggleModule(
    guildId: string,
    module: string,
    action: 'enable' | 'disable'
  ): Promise<Result<string>> {
    const mod = module as Module
    const command = [...this.handlers.commands.values()].find(c =>
      c.moduleId === mod
    )
    if (!command) return error(`No commands for ${mod}.`)

    const config = await this.ensureConfig(guildId)
    const enabled = config.modules.includes(mod)

    if (action === 'enable') {
      if (enabled) return ok('Already enabled!')
      await this.client.prisma.config.update({
        where: { guildId: BigInt(guildId) },
        data: { modules: { push: mod } }
      })
      await this.client.application.createGuildCommand(
        guildId,
        this.toSlashJson(command) as CreateGuildApplicationCommandOptions
      )
    } else {
      if (!enabled) return ok('Already disabled.')
      await this.client.prisma.config.update({
        where: { guildId: BigInt(guildId) },
        data: {
          modules: { set: config.modules.filter((m: Module) => m !== mod) }
        }
      })
      const guildCommands = await this.client.application.getGuildCommands(
        guildId
      )
      const found = guildCommands.find(cmd => cmd.name === command.name)
      if (found) {
        await this.client.application.deleteGuildCommand(guildId, found.id)
      }
    }

    const name = modules.find(m => m.value === mod)?.name ?? mod
    return ok(`${capitalize(action)}d ${name}`)
  }

  public async listModules(guildId: string): Promise<Result<string>> {
    const config = await this.ensureConfig(guildId)

    if (config.modules.length === 0) {
      return ok('No modules enabled.')
    }

    const names = config.modules
      .map((m: Module) => modules.find(_m => _m.value === m)?.name ?? m)
      .join(', ')

    return ok(`Enabled modules: ${names}`)
  }

  public async syncModules(): Promise<Result<string>> {
    const guilds = [...this.client.guilds.values()]

    // Process guilds in parallel for better performance
    const syncPromises = guilds.map(async (guild) => {
      try {
        const config = await this.client.prisma.config.findUnique({
          where: { guildId: BigInt(guild.id) },
          select: { modules: true }
        })

        // skip if no config
        if (!config) return { guildId: guild.id, success: true, error: null }

        // find all commands that belong to enabled modules
        const wanted = [...this.handlers.commands.values()].filter(
          c => c.moduleId && config.modules.includes(c.moduleId)
        )

        // always include non-modular commands
        const baseline = [...this.handlers.commands.values()].filter(
          c => !c.moduleId && !c.disabled
        )

        const target = [...baseline, ...wanted].map(c =>
          this.toSlashJson(c) as CreateGuildApplicationCommandOptions
        )

        // also include user commands
        const userCmds = [...this.handlers.userCommands.values()].map(c =>
          this.toUserJson(c)
        )

        // bulk replace in one go
        await this.client.application.bulkEditGuildCommands(guild.id, [
          ...target,
          ...userCmds
        ])

        return { guildId: guild.id, success: true, error: null }
      } catch (err) {
        const errorMsg = `Failed to sync guild ${guild.id}: ${
          (err as Error).message
        }`
        this.interactionsLogger.error(errorMsg, err)
        return { guildId: guild.id, success: false, error: errorMsg }
      }
    })

    // Wait for all guild syncs to complete
    const results = await Promise.allSettled(syncPromises)
    const errors: string[] = []
    let successCount = 0

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successCount++
        } else if (result.value.error) {
          errors.push(result.value.error)
        }
      } else {
        errors.push(`Unexpected error: ${result.reason}`)
      }
    }

    if (errors.length > 0) {
      this.interactionsLogger.warn(
        `Module sync completed with ${errors.length} errors out of ${guilds.length} guilds`
      )
      return error(
        `Module sync completed with ${errors.length} errors: ${
          errors.slice(0, 3).join(', ')
        }${errors.length > 3 ? '...' : ''}`
      )
    }

    this.interactionsLogger.info(
      `Successfully synced modules for ${successCount} guilds`
    )
    return ok(`Successfully synced modules for ${successCount} guilds`)
  }
}
