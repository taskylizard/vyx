import type { Awaitable } from '@antfu/utils'
import type { $Enums } from '@prisma/client'
import type {
  ApplicationCommandOptions,
  ApplicationCommandOptionsWithValue,
  AutocompleteInteraction,
  Constants,
  CreateMessageApplicationCommandOptions
} from 'oceanic.js'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import type { Context } from './context'

export type CommandOptionType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'user'
  | 'channel'
  | 'role'
  | 'mentionable'
  | 'number'
  | 'attachment'
  | 'sub_command'
  | 'sub_command_group'

const CommandOptionTypeMap: Record<
  CommandOptionType,
  ApplicationCommandOptionTypes
> = {
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

export type CustomCommandOption = Omit<
  ApplicationCommandOptions,
  'type' | 'name'
> & {
  type: CommandOptionType | ApplicationCommandOptionTypes
  name?: string
}

export type CommandOptions = Record<
  string,
  ApplicationCommandOptions | CustomCommandOption
>

/**
 * Interface representing a slash command.
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
  options?: CommandOptions
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
 * Represents a subcommand without options or nested subcommands.
 */
type SubCommandEndpoint = Omit<SlashCommand, 'options' | 'subcommands'>

/**
 * Mapping of option names to option objects for subcommands
 */
export type SubCommandOptions = Record<
  string,
  ApplicationCommandOptionsWithValue | CustomCommandOption
>

/**
 * Represents a subcommand, which can have options and nested subcommands.
 */
export type SubCommand = SubCommandEndpoint & {
  /**
   * The options for the subcommand.
   */
  options?: SubCommandOptions
  /**
   * The nested subcommands for this subcommand.
   */
  subcommands?: SubCommand[]
}

/**
 * Normalize command options by converting string types to their numeric equivalents
 */
function normalizeCommandOptions(
  options?: CommandOptions
): ApplicationCommandOptions[] | undefined {
  if (!options) return undefined

  return Object.entries(options).map(([name, option]) => {
    const opt = { ...option, name }
    if (typeof opt.type === 'string') {
      opt.type = CommandOptionTypeMap[opt.type as CommandOptionType]
    }
    return opt as ApplicationCommandOptions
  })
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

/**
 * Converts a CommandOptions object to an array of ApplicationCommandOptions for
 * compatibility with the Discord API. This is used internally when sending
 * the commands to Discord.
 *
 * @param options The options object to convert
 * @returns An array of ApplicationCommandOptions
 */
export function commandOptionsToArray(
  options?: CommandOptions
): ApplicationCommandOptions[] {
  return normalizeCommandOptions(options) || []
}

/**
 * Converts a SubCommandOptions object to an array of ApplicationCommandOptionsWithValue.
 *
 * @param options The options object to convert
 * @returns An array of ApplicationCommandOptionsWithValue
 */
export function subCommandOptionsToArray(
  options?: SubCommandOptions
): ApplicationCommandOptionsWithValue[] {
  if (!options) return []

  return Object.entries(options).map(([name, option]) => {
    const opt = { ...option, name }
    if (typeof opt.type === 'string') {
      opt.type = CommandOptionTypeMap[opt.type as CommandOptionType]
    }
    return opt as ApplicationCommandOptionsWithValue
  })
}
