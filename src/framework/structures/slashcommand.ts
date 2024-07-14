import type { Module } from '@prisma/client';
import type {
  Attachment,
  AutocompleteInteraction,
  CreateMessageApplicationCommandOptions,
  PermissionName
} from 'oceanic.js';
import type { Context } from './context';

// Please save me.

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
  name: string;
  description: string;
  type: OptionType;
  required?: boolean;
};

export type ExtractNames<O extends Option[]> = O[number]['name'];

export type ExtractOptionByName<
  O extends Option[],
  K extends string
> = O[number] extends infer P ? (P extends { name: K } ? P : never) : never;

export type OptionValue<Opt extends Option> = Opt['required'] extends true
  ? NullableValue<OptionTypeValue<Opt['type']>, Opt['required']>
  : OptionTypeValue<Opt['type']> | null;

type NullableValue<
  O extends any,
  Required extends boolean | undefined
> = Required extends true ? O : O | null;

export type OptionTypeValue<T extends OptionType> = T extends 'boolean'
  ? boolean
  : T extends 'string'
    ? string
    : T extends 'integer'
      ? number
      : T extends 'number'
        ? number
        : T extends 'user'
          ? string
          : T extends 'role'
            ? string
            : T extends 'channel'
              ? string
              : T extends 'snowflake'
                ? string
                : T extends 'attachment'
                  ? Attachment
                  : never;

type SlashCommandBase<O extends Option[]> = {
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
} & Omit<CreateMessageApplicationCommandOptions, 'type'>;

type SlashCommandWithRun<O extends Option[]> = SlashCommandBase<O> & {
  subcommands?: never;
  /**
   * The description of the command.
   */
  description: string;
  /**
   * The options for the command.
   */
  options?: O;
  /**
   * The main handler of your command.
   * @param {Context} ctx - The command context.
   * @returns {Promise<unknown>} A promise that resolves when the command is executed.
   */
  run?: (ctx: Context<O>) => Promise<unknown> | string;
};

type SlashCommandWithSubcommands<O extends Option[]> = SlashCommandBase<O> & {
  description?: never;
  options?: never;
  run?: never;
  /**
   * The subcommands for the command.
   */
  subcommands: SubCommand<O>[];
};

type SubCommandEndpoint<O extends Option[]> = Omit<
  SlashCommand<O>,
  'options' | 'subcommands'
>;

export type SubCommand<O extends Option[]> = SubCommandEndpoint<O> & {
  /**
   * The options for the subcommand.
   */
  options?: O;
  /**
   * The subcommands for the subcommand.
   */
  subcommands?: SubCommand<O>[];
};

export type SlashCommand<O extends Option[]> =
  | SlashCommandWithRun<O>
  | SlashCommandWithSubcommands<O>;

/**
 * Defines a slash command with the given options.
 * @param {SlashCommand} options - The options for the command.
 * @returns {SlashCommand} The defined command.
 */
export function defineSlashCommand<O extends Option[]>(
  options: SlashCommand<O>
): SlashCommand<O> {
  return options;
}
