import type { Awaitable } from '@antfu/utils'
import type { Module } from '@packages/database'
import type { Constants } from 'oceanic.js'
import type { PrefixContext } from './prefix-context'
import type { ArgumentsSchema, ParsedArguments } from './prefix-parser'

/**
 * Interface representing a prefix command with typed arguments.
 */
export type PrefixCommand<T extends ArgumentsSchema = ArgumentsSchema> = {
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
   * Alternative names for the command.
   */
  aliases?: string[]
  /**
   * The description of the command.
   */
  description: string
  /**
   * Argument definitions for type-safe parsing.
   */
  args?: T
  /**
   * Usage example for the command.
   */
  usage?: string
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
   * The pre-load check. You can use this to run something before execution.
   * @param {PrefixContext} ctx - The command context.
   * @returns {Awaitable<boolean>} Whether the pre-load check passes.
   */
  check?: (ctx: PrefixContext<T>) => Awaitable<boolean>
  /**
   * The main handler of your command with typed arguments.
   * @param {PrefixContext<T>} ctx - The command context.
   * @returns {Promise<unknown>} A promise that resolves when the command is executed.
   */
  run: (ctx: PrefixContext<T>) => Promise<unknown>
}

/**
 * Type helper for inferring argument types from a command.
 */
export type InferCommandArgs<T> = T extends PrefixCommand<infer A>
  ? ParsedArguments<A>
  : never

/**
 * Defines a single prefix command with type-safe arguments.
 * @param {PrefixCommand<T>} command - The prefix command to define.
 * @returns {PrefixCommand<T>} The defined prefix command.
 */
export function definePrefixCommand<T extends ArgumentsSchema>(
  command: PrefixCommand<T>
): PrefixCommand<T>

/**
 * Defines multiple prefix commands.
 * @param {PrefixCommand[]} commands - An array of prefix commands to define.
 * @returns {PrefixCommand[]} The array of defined prefix commands.
 */
export function definePrefixCommand(commands: PrefixCommand[]): PrefixCommand[]

/**
 * Defines one or more prefix commands.
 * @param {PrefixCommand | PrefixCommand[]} options - A single prefix command or an array of prefix commands.
 * @returns {PrefixCommand | PrefixCommand[]} The defined prefix command(s).
 */
export function definePrefixCommand<T extends ArgumentsSchema>(
  options: PrefixCommand<T> | PrefixCommand[]
): PrefixCommand<T> | PrefixCommand[] {
  return options
}
