import type { Awaitable } from '@antfu/utils'
import type { Module } from '@packages/database'
import type {
  ApplicationCommandOptions,
  AutocompleteInteraction,
  Constants,
  CreateMessageApplicationCommandOptions
} from 'oceanic.js'
import type { Context } from './context'

export const modules: { name: string; value: Module }[] = [
  { name: '📮 Report', value: 'REPORT' },
  { name: '🍣 Economy', value: 'ECONOMY' },
  { name: '🔨 Moderation', value: 'MODERATION' },
  { name: '🤖 Query Engine', value: 'QUERY_ENGINE' }
] as const

/**
 * Interface representing a slash command.
 */
export type SlashCommand = {
  /**
   * Module id for modular commands splitting.
   */
  moduleId?: Module
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
   * The IDs of the guilds where this command is available.
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
   * @returns {Awaitable<boolean>} Whether the pre-load check passes.
   */
  check?: (ctx: Context) => Awaitable<boolean>
  /**
   * The main handler of your command.
   * @param {Context} ctx - The command context.
   * @returns {Promise<unknown>} A promise that resolves when the command is executed.
   */
  run?: ((ctx: Context) => Promise<unknown>) | string
} & Omit<CreateMessageApplicationCommandOptions, 'type'>

/**
 * Represents a subcommand without nested subcommands.
 */
type SubCommandEndpoint = Omit<SlashCommand, 'subcommands'>

/**
 * Represents a subcommand, which can have options and nested subcommands.
 */
export type SubCommand = SubCommandEndpoint & {
  /**
   * The nested subcommands for this subcommand.
   */
  subcommands?: SubCommand[]
}

/**
 * Defines a single slash command.
 * @param {SlashCommand} command - The slash command to define.
 * @returns {SlashCommand} The defined slash command.
 */
export function defineSlashCommand(command: SlashCommand): SlashCommand

/**
 * Defines multiple slash commands.
 * @param {SlashCommand[]} commands - An array of slash commands to define.
 * @returns {SlashCommand[]} The array of defined slash commands.
 */
export function defineSlashCommand(commands: SlashCommand[]): SlashCommand[]

/**
 * Defines one or more slash commands.
 * @param {SlashCommand | SlashCommand[]} options - A single slash command or an array of slash commands.
 * @returns {SlashCommand | SlashCommand[]} The defined slash command(s).
 */
export function defineSlashCommand(
  options: SlashCommand | SlashCommand[]
): SlashCommand | SlashCommand[] {
  return options
}
