import { colorize } from 'consola/utils'
import type {
  ApplicationCommandOptions,
  ApplicationCommandOptionsSubCommand,
  ApplicationCommandOptionsWithValue,
  CreateApplicationCommandOptions,
  CreateGuildApplicationCommandOptions,
  CreateMessageApplicationCommandOptions,
  CreateUserApplicationCommandOptions
} from 'oceanic.js'
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Collection,
  Permissions
} from 'oceanic.js'
import FactCheckMessageCommand from '../../message/fact-check'
import AvatarUserCommand from '../../user/avatar'
import ReportUserCommand from '../../user/report'
import {
  type Client,
  type ComponentInteractionHandler,
  createGuard,
  error,
  type MessageCommand,
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

const messageCommands = {
  factCheck: FactCheckMessageCommand
} as const

import { capitalize } from '@antfu/utils'
import type { Module } from '@packages/database'
import { slashCommands } from '../../commands'
import { prefixCommands } from '../../commands/prefix'
import AiTasksActionInteraction from '../../interactions/ai/tasks-action.tsx'
import AiTasksCreateSubmitInteraction from '../../interactions/ai/tasks-create-submit'
import AiTasksCreateInteraction from '../../interactions/ai/tasks-create.tsx'
import AiTasksDeleteInteraction from '../../interactions/ai/tasks-delete'
import AiTasksEditSubmitInteraction from '../../interactions/ai/tasks-edit-submit'
import AiTasksEditInteraction from '../../interactions/ai/tasks-edit.tsx'
import AiTasksToggleInteraction from '../../interactions/ai/tasks-toggle'
import AiTaskTaskTriggerInteraction from '../../interactions/ai/trigger-task'
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
  'support.resolved': SupportResolveInteraction,
  'ai-task-trigger': AiTaskTaskTriggerInteraction,
  'ai.tasks.action': AiTasksActionInteraction,
  'ai.tasks.toggle.select': AiTasksToggleInteraction,
  'ai.tasks.delete.select': AiTasksDeleteInteraction,
  'ai.tasks.edit.select': AiTasksEditInteraction,
  'ai.tasks.edit.submit': AiTasksEditSubmitInteraction,
  'ai.tasks.create': AiTasksCreateInteraction,
  'ai.tasks.create.submit': AiTasksCreateSubmitInteraction
} as const

export class InteractionsManager {
  public handlers: {
    commands: Collection<string, SlashCommand>
    userCommands: Collection<string, UserCommand>
    messageCommands: Collection<string, MessageCommand>
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
      messageCommands: new Collection(),
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
    for (const command of Object.keys(messageCommands)) {
      this.loadMessageCommand(command as keyof typeof messageCommands)
    }
    for (const interaction of Object.keys(interactions)) {
      this.loadComponentInteraction(interaction as keyof typeof interactions)
    }

    for (const command of Object.values(prefixCommands)) {
      this.client.managers.prefixCommands.register(command as any)
    }

    this.interactionsLogger.info(
      `Loaded: ${this.handlers.commands.size} slash commands • ${this.handlers.userCommands.size} user commands • ${this.handlers.messageCommands.size} message commands • ${this.handlers.components.size} components • ${this.client.managers.prefixCommands.commands.size} prefix commands`
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

  private loadMessageCommand(path: keyof typeof messageCommands) {
    let cmd: MessageCommand
    try {
      cmd = messageCommands[path]
      if (this.handlers.messageCommands.has(cmd.name)) {
        this.interactionsLogger.warn(
          `Attempted to load already existing message-command ${cmd.name}`
        )
        throw new Error(`Message command ${cmd.name} already exists.`)
      }

      this.handlers.messageCommands.set(cmd.name, cmd)
      this.interactionsLogger.debug(`Loaded message-command ${cmd.name}.`)
      return cmd
    } catch (error) {
      this.interactionsLogger.error(
        `Failed to load message-command ${path}.`,
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
      const _guildSlashCommands = new Collection<
        string,
        CreateApplicationCommandOptions[]
      >()

      // only include user commands without moduleId or guilds for global registration
      const userCommandList = [...this.handlers.userCommands.values()]
        .filter(cmd =>
          !cmd.moduleId && (!cmd.guilds || cmd.guilds.length === 0)
        )
        .map((command) => this.toUserJson(command))

      // only include message commands without moduleId or guilds for global registration
      const messageCommandList = [...this.handlers.messageCommands.values()]
        .filter(cmd =>
          !cmd.moduleId && (!cmd.guilds || cmd.guilds.length === 0)
        )
        .map((command) => this.toMessageJson(command))

      if (this.client.env.NODE_ENV !== 'production') {
        this.interactionsLogger.info(
          `Running in ${
            colorize('red', 'development')
          } mode, guild commands will be synced via syncModules()...`
        )
        // In development, we don't register global commands
        // syncModules() handles all command registration for guilds
      } else {
        // Production logic...
        this.interactionsLogger.info(
          `Running in ${colorize('greenBright', 'production')} mode.`
        )

        // only register truly global commands (no moduleId, no guilds restriction, not guildOnly)
        for (
          const command of this.handlers.commands
            .filter((command) => !command.moduleId)
            .filter((command) => !command.disabled)
            .filter((command) => !command.guilds || command.guilds.length === 0)
            .filter((command) => !command.guildOnly)
            .values()
        ) {
          slashCommands.push(this.toSlashJson(command))
        }

        // Register global commands only
        this.interactionsLogger.info(
          forceRegister
            ? 'Force registration enabled, registering global commands.'
            : 'Registering global commands.'
        )

        await this.client.application.bulkEditGlobalCommands([
          ...slashCommands,
          ...userCommandList,
          ...messageCommandList
        ])
      }

      this.interactionsLogger.info(
        `Updated all ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands and ${this.handlers.messageCommands.size} message commands.`
      )

      const syncResult = await this.syncModules()
      if (!syncResult.ok) {
        return error(
          `Command update succeeded but module sync failed: ${syncResult.error}`
        )
      }

      return ok(
        `Successfully updated ${this.handlers.commands.size} slash commands and ${this.handlers.userCommands.size} user commands and ${this.handlers.messageCommands.size} message commands`
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

    let defaultMemberPermissions = command.defaultMemberPermissions
    if (command.requiredPermissions && command.requiredPermissions.length > 0) {
      // Convert required permissions to bitfield
      let bitfield = 0n
      for (const perm of command.requiredPermissions) {
        bitfield |= Permissions[perm as keyof typeof Permissions]
      }
      defaultMemberPermissions = bitfield.toString()
    }

    return {
      type: ApplicationCommandTypes.CHAT_INPUT,
      name: command.name,
      description: command.description,
      options: options,
      integrationTypes: command.integrationTypes,
      nsfw: command.nsfw,
      contexts: command.contexts,
      defaultMemberPermissions: defaultMemberPermissions
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

  private toMessageJson(
    command: MessageCommand
  ): CreateMessageApplicationCommandOptions {
    return {
      type: ApplicationCommandTypes.MESSAGE,
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
    const isProduction = this.client.env.NODE_ENV === 'production'

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

        // include non-modular commands but exclude those registered globally in production
        const baseline = [...this.handlers.commands.values()].filter(c => {
          if (c.moduleId || c.disabled) return false

          // if production, exclude commands already registered globally
          if (isProduction) {
            const isGloballyRegistered = !c.guildOnly &&
              (!c.guilds || c.guilds.length === 0)
            if (isGloballyRegistered) return false
          }

          return true
        })

        // include guild-specific commands for this guild
        const guildSpecific = [...this.handlers.commands.values()].filter(
          c => !c.disabled && c.guilds && c.guilds.includes(guild.id)
        )

        const target = [...baseline, ...wanted, ...guildSpecific].map(c =>
          this.toSlashJson(c) as CreateGuildApplicationCommandOptions
        )

        // user commands: include based on module and guild restrictions
        const wantedUserCmds = [...this.handlers.userCommands.values()].filter(
          c => c.moduleId && config.modules.includes(c.moduleId)
        )
        const baselineUserCmds = [...this.handlers.userCommands.values()]
          .filter(c => {
            if (c.moduleId) return false
            // in production, exclude commands already registered globally
            if (isProduction) {
              const isGloballyRegistered = !c.guilds || c.guilds.length === 0
              if (isGloballyRegistered) return false
            }
            return true
          })
        const guildSpecificUserCmds = [...this.handlers.userCommands.values()]
          .filter(
            c => c.guilds && c.guilds.includes(guild.id)
          )

        const userCmds = [
          ...baselineUserCmds,
          ...wantedUserCmds,
          ...guildSpecificUserCmds
        ].map(c => this.toUserJson(c))

        // message commands: include based on module and guild restrictions
        const wantedMessageCmds = [...this.handlers.messageCommands.values()]
          .filter(
            c => c.moduleId && config.modules.includes(c.moduleId)
          )
        const baselineMessageCmds = [...this.handlers.messageCommands.values()]
          .filter(c => {
            if (c.moduleId) return false
            // in production, exclude commands already registered globally
            if (isProduction) {
              const isGloballyRegistered = !c.guilds || c.guilds.length === 0
              if (isGloballyRegistered) return false
            }
            return true
          })
        const guildSpecificMessageCmds = [
          ...this.handlers.messageCommands.values()
        ]
          .filter(
            c => c.guilds && c.guilds.includes(guild.id)
          )

        const messageCmds = [
          ...baselineMessageCmds,
          ...wantedMessageCmds,
          ...guildSpecificMessageCmds
        ].map(c => this.toMessageJson(c))

        // bulk replace in one go
        await this.client.application.bulkEditGuildCommands(guild.id, [
          ...target,
          ...userCmds,
          ...messageCmds
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
