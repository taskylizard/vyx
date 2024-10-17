import type {
  CommandInteraction,
  CreateUserApplicationCommandOptions
} from 'oceanic.js'

/**
 * Represents a user command with a run method to handle interactions.
 */
export type UserCommand = {
  run: (interaction: CommandInteraction) => Promise<unknown>
} & Omit<CreateUserApplicationCommandOptions, 'type'>

/**
 * Defines a user command.
 * @param {UserCommand} command - The user command that'll show on user context-menus.
 * @returns {UserCommand} The defined user command.
 */
export function defineUserCommand(command: UserCommand): UserCommand {
  return command
}
