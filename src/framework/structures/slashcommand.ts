import type { Module } from '@prisma/client';
import type {
  Attachment,
  AutocompleteInteraction,
  CreateMessageApplicationCommandOptions,
  InteractionResolvedChannel,
  PermissionName,
  Role,
  User
} from 'oceanic.js';
import type { Context } from './context';

export type OptionType =
  | 'boolean'
  | 'string'
  | 'integer'
  | 'number'
  | 'user'
  | 'role'
  | 'channel'
  | 'snowflake'
  | 'attachment';

export type Option = {
  description: string;
  type: OptionType;
  required?: boolean;
};

export type OptionTypeValue<T extends OptionType> = T extends 'boolean'
  ? boolean
  : T extends 'string'
    ? string
    : T extends 'integer'
      ? number
      : T extends 'number'
        ? number
        : T extends 'user'
          ? User
          : T extends 'role'
            ? Role
            : T extends 'channel'
              ? InteractionResolvedChannel
              : T extends 'snowflake'
                ? string
                : T extends 'attachment'
                  ? Attachment
                  : never;

export type OptionValue<O extends Option> = O['required'] extends true
  ? NullableValue<OptionTypeValue<O['type']>, O['required']>
  : OptionTypeValue<O['type']> | null;

type NullableValue<
  O extends any,
  Required extends boolean | undefined
> = Required extends true ? O : O | null;

export type SlashCommand<
  O extends Record<string, Option> = Record<string, Option>
> = {
  /**
   * Module id for modular commands splitting.
   */
  moduleId?: Module;
  /**
   * If this command is disabled.
   */
  disabled?: boolean;
  /**
   * The name of the command.
   */
  name: string;
  /**
   * The description of the command.
   */
  description: string;
  /**
   * The options for the command.
   */
  options?: O;
  /**
   * The subcommands for the command.
   */
  subcommands?: SubCommand<O>[];
  /**
   * Whether the command is owner-only.
   */
  ownerOnly?: boolean;
  /**
   * Whether the command is guild-only.
   */
  guildOnly?: boolean;
  /**
   * The ID of the guild.
   */
  guilds?: string[];
  /**
   * The cooldown for the command in seconds.
   */
  cooldown?: number;
  /**
   * The permissions required to execute the command.
   */
  requiredPermissions?: PermissionName[];
  /**
   * The autocomplete handler for the command.
   * @param {Object} options - The autocomplete options.
   * @param {Context} options.ctx - The command context.
   * @param {AutocompleteInteraction} options.autocomplete - The autocomplete interaction.
   * @returns {Promise<unknown>} A promise that resolves when autocomplete is handled.
   */
  autocomplete?: (options: {
    ctx: Context<O>;
    autocomplete: AutocompleteInteraction;
  }) => Promise<unknown>;
  /**
   * The pre-load check. You can use this to run something before execution.
   * @param {Context} ctx - The command context.
   * @returns {Promise<boolean>} Whether the pre-load check passes.
   */
  check?: (ctx: Context<O>) => Promise<boolean>;
  /**
   * The main handler of your command.
   * @param {Context} ctx - The command context.
   * @returns {Promise<unknown>} A promise that resolves when the command is executed.
   */
  run?: ((ctx: Context<O>) => Promise<unknown>) | string;
} & Omit<CreateMessageApplicationCommandOptions, 'type'>;

type SubCommandEndpoint = Omit<SlashCommand, 'options' | 'subcommands'>;

export type SubCommand<O extends Record<string, Option>> =
  SubCommandEndpoint & {
    /**
     * The options for the subcommand.
     */
    options?: O;
    /**
     * The subcommands for the subcommand.
     */
    subcommands?: SubCommand<O>[];
  };

/**
 * Defines a slash command with the given options.
 * @param {SlashCommand} options - The options for the command.
 * @returns {SlashCommand} The defined command.
 */
export function defineSlashCommand<F extends Record<string, Option>>(
  options: SlashCommand<F>
): SlashCommand<F> {
  return options;
}
