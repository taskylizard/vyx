import type { Module } from '@packages/database'
import type {
  CommandInteraction,
  CreateMessageApplicationCommandOptions
} from 'oceanic.js'

/**
 * Represents a message command with a run method to handle interactions.
 */
export type MessageCommand = {
  run: (interaction: CommandInteraction) => Promise<unknown>
  guilds?: string[]
  moduleId?: Module
} & Omit<CreateMessageApplicationCommandOptions, 'type'>

/**
 * Defines a message command.
 * @param {MessageCommand} command - The message command that'll show on message context-menus.
 * @returns {MessageCommand} The defined message command.
 */
export function defineMessageCommand(command: MessageCommand): MessageCommand {
  return command
}
