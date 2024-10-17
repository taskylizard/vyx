import type { Awaitable } from '@antfu/utils'
import type { $Enums } from '@prisma/client'
import type {
  ApplicationCommandOptions,
  ApplicationCommandOptionsWithValue,
  AutocompleteInteraction,
  Constants,
  CreateMessageApplicationCommandOptions
} from 'oceanic.js'
import type { Context } from './context'

/**
 * Interface representing a command.
 */
export type SlashCommand = {
  /**
   * Module id for modular commands splitting.
   */
  moduleId?: $Enums.Module
  /**
   * If this command is disabled.
   */
  disabled?: boolean
  /**
   * The name of the command.
   */
  name: string
  /**
   * The description of the command.
   */
  description: string
  /**
   * The options for the command.
   */
  options?: ApplicationCommandOptions[]
  /**
   * The subcommands for the command.
   */
  subcommands?: SubCommand[]
  /**
   * Whether the command is owner-only.
   */
  ownerOnly?: boolean
  /**
   * Whether the command is guild-only.
   */
  guildOnly?: boolean
  /**
   * The ID of the guild.
   */
  guilds?: string[]
  /**
   * The cooldown for the command in seconds.
   */
  cooldown?: number
  /**
   * The permissions required to execute the command.
   */
  requiredPermissions?: Constants.PermissionName[]
  /**
   * The autocomplete handler for the command.
   * @param {Object} options - The autocomplete options.
   * @param {Context} options.ctx - The command context.
   * @param {AutocompleteInteraction} options.autocomplete - The autocomplete interaction.
   * @returns {Promise<unknown>} A promise that resolves when autocomplete is handled.
   */
  autocomplete?: (options: {
    ctx: Context
    autocomplete: AutocompleteInteraction
  }) => Promise<unknown>
  /**
   * The pre-load check. You can use this to run something before execution.
   * @param {Context} ctx - The command context.
   * @returns {boolean} Whether the pre-load check passes.
   */
  check?: (ctx: Context) => Awaitable<boolean>
  /**
   * The main handler of your command.
   * @param {Context} ctx - The command context.
   * @returns {Promise<unknown>} A promise that resolves when the command is executed.
   */
  run?: ((ctx: Context) => Promise<unknown>) | string
} & Omit<CreateMessageApplicationCommandOptions, 'type'>

type SubCommandEndpoint = Omit<SlashCommand, 'options' | 'subcommands'>

export type SubCommand = SubCommandEndpoint & {
  /**
   * The options for the subcommand.
   */
  options?: ApplicationCommandOptionsWithValue[]
  /**
   * The subcommands for the subcommand.
   */
  subcommands?: SubCommand[]
}

/**
 * Defines a slash command with the given options.
 * @param {SlashCommand} options - The options for the command.
 * @returns {SlashCommand} The defined command.
 */
export function defineSlashCommand(options: SlashCommand): SlashCommand {
  return options
}
