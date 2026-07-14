import { SlashCommandContext } from './context.ts'
import { ROSEPACK_TYPE_MESSAGES, type RosepackTypeError } from './errors.ts'
import {
  setSlashCommandExecutor,
  setSlashSubcommandExecutor,
  type SlashCommandExecutor
} from './executors.ts'
import type { SlashCommandContextName, SlashCommandInstallation } from './metadata.ts'

/** Option kinds supported by rosepack's chat-input command builder. */
export type SlashCommandOptionKind = 'boolean' | 'integer' | 'number' | 'string'
/** A resolved scalar option value passed to a command handler. */
export type SlashCommandOptionValue = boolean | number | string

/** A label and literal value shown as a Discord option choice. */
export interface SlashCommandOptionChoice<TValue extends number | string = number | string> {
  name: string
  value: TValue
}

/** Describes one slash-command option and its Discord validation constraints. */
export interface SlashCommandValueOptionDefinition {
  choices?: readonly SlashCommandOptionChoice[]
  description: string
  kind: SlashCommandOptionKind
  maxLength?: number
  minLength?: number
  required?: boolean
}

/** Alias for a supported slash-command option definition. */
export type SlashCommandOptionDefinition = SlashCommandValueOptionDefinition

/** An option-name-to-definition map used by command definitions. */
export interface SlashCommandValueOptionRecord {
  [name: string]: SlashCommandValueOptionDefinition
}

/** Alias for a slash-command option record. */
export type SlashCommandOptionRecord = SlashCommandValueOptionRecord

type RequiredSlashCommandOptionNames<TOptions extends SlashCommandValueOptionRecord> = {
  [Name in keyof TOptions]-?: TOptions[Name] extends { required: true } ? Name : never
}[keyof TOptions]

type OptionalSlashCommandOptionNames<TOptions extends SlashCommandValueOptionRecord> = Exclude<
  keyof TOptions,
  RequiredSlashCommandOptionNames<TOptions>
>

type SlashCommandOptionKindValue<TKind extends SlashCommandOptionKind> = TKind extends 'boolean'
  ? boolean
  : TKind extends 'integer' | 'number'
    ? number
    : string

type SlashCommandOptionValueFor<TOption extends SlashCommandValueOptionDefinition> =
  TOption extends { choices: readonly SlashCommandOptionChoice<infer TValue>[] }
    ? TValue
    : SlashCommandOptionKindValue<TOption['kind']>

type Simplify<T> = { -readonly [Key in keyof T]: T[Key] }

/** Infers the required and optional runtime values for an option record. */
export type SlashCommandOptionValues<TOptions extends SlashCommandValueOptionRecord> = Simplify<
  {
    [Name in RequiredSlashCommandOptionNames<TOptions>]: SlashCommandOptionValueFor<TOptions[Name]>
  } & {
    [Name in OptionalSlashCommandOptionNames<TOptions>]?: SlashCommandOptionValueFor<TOptions[Name]>
  }
>

const slashSubcommandBrand = Symbol('rosepack.slash-subcommand')
const appContextBrand = Symbol('rosepack.app-context')

/** Fields shared by executable subcommand definitions. */
export interface SlashSubcommandDefinitionBase<TApp = unknown> {
  readonly [appContextBrand]?: TApp
  readonly [slashSubcommandBrand]: true
  description: string
  options?: SlashCommandValueOptionRecord
}

/** An executable subcommand definition returned by `subcommand()`. */
export interface SlashSubcommandDefinition<
  TApp = unknown,
  TOptions extends SlashCommandValueOptionRecord = {}
> extends SlashSubcommandDefinitionBase<TApp> {
  execute(context: SlashCommandContext<TApp, TOptions>): Promise<void>
  options?: TOptions
}

/** A map of executable leaves allowed beneath a Discord subcommand group. */
export interface SlashSubcommandLeafRecord<TApp = unknown> {
  [name: string]: SlashSubcommandDefinitionBase<TApp>
}

/** A non-executable Discord subcommand group and its executable children. */
export interface SlashSubcommandGroupDefinition<
  TApp = unknown,
  TSubcommands extends SlashSubcommandLeafRecord<TApp> = SlashSubcommandLeafRecord<TApp>
> {
  description: string
  execute?: never
  options?: never
  subcommands: TSubcommands
}

/** A map of root-level subcommands or subcommand groups. */
export interface SlashSubcommandRecord<TApp = unknown> {
  [name: string]: SlashSubcommandDefinitionBase<TApp> | SlashSubcommandGroupDefinition<TApp>
}

export interface SlashSubcommandInput<TApp, TOptions extends SlashCommandValueOptionRecord> {
  description: string
  execute(context: SlashCommandContext<TApp, TOptions>): Promise<void>
  options?: TOptions
}

/** Metadata and lifecycle hooks shared by flat and routed root commands. */
export interface SlashCommandMetadata<TApp = unknown> {
  beforeExecute?(
    context: SlashCommandContext<TApp, SlashCommandValueOptionRecord>
  ): void | Promise<void>
  contexts?: readonly SlashCommandContextName[]
  description: string
  installations?: readonly SlashCommandInstallation[]
  name: string
  onError?(
    context: SlashCommandContext<TApp, SlashCommandValueOptionRecord>,
    error: unknown
  ): void | Promise<void>
}

/** The common shape accepted wherever any root command is allowed. */
export interface SlashRootCommandDefinitionBase<TApp = unknown> extends SlashCommandMetadata<TApp> {
  options?: SlashCommandValueOptionRecord
  subcommands?: SlashSubcommandRecord<TApp>
}

/** A flat, executable root command definition. */
export interface SlashCommandDefinition<
  TApp = unknown,
  TOptions extends SlashCommandValueOptionRecord = {}
> extends SlashRootCommandDefinitionBase<TApp> {
  execute(context: SlashCommandContext<TApp, TOptions>): Promise<void>
  options?: TOptions
  subcommands?: never
}

/** A routed root command containing subcommands instead of a root handler. */
export interface SlashSubcommandCommandDefinition<
  TApp = unknown,
  TSubcommands extends SlashSubcommandRecord<TApp> = SlashSubcommandRecord<TApp>
> extends SlashRootCommandDefinitionBase<TApp> {
  execute?: never
  options?: never
  subcommands: TSubcommands
}

type ValidateNestedLeaf<TNode> = TNode extends SlashSubcommandDefinitionBase
  ? true
  : TNode extends { subcommands: unknown }
    ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['nestedGroup']>
    : TNode extends { execute: (...arguments_: never[]) => unknown }
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['helperFreeLeaf']>
      : RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['invalidNode']>

type CollectValidationErrors<TResults> =
  Exclude<TResults, true> extends never ? true : Exclude<TResults, true>

type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

type LastUnionMember<TUnion> =
  UnionToIntersection<TUnion extends unknown ? () => TUnion : never> extends () => infer TLast
    ? TLast
    : never

type HasMoreThan25Members<TUnion, TCount extends unknown[] = []> = TCount['length'] extends 26
  ? true
  : [TUnion] extends [never]
    ? false
    : HasMoreThan25Members<Exclude<TUnion, LastUnionMember<TUnion>>, [...TCount, unknown]>

type HasMoreThan25Keys<TRecord> = string extends keyof TRecord
  ? false
  : number extends keyof TRecord
    ? false
    : symbol extends keyof TRecord
      ? false
      : HasMoreThan25Members<keyof TRecord>

type ValidateNestedLeaves<TNodes> =
  TNodes extends Record<PropertyKey, unknown>
    ? keyof TNodes extends never
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['emptySubcommands']>
      : HasMoreThan25Keys<TNodes> extends true
        ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['tooManySubcommands']>
        : CollectValidationErrors<
            { [Name in keyof TNodes]: ValidateNestedLeaf<TNodes[Name]> }[keyof TNodes]
          >
    : RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['invalidNode']>

type ValidateRootNode<TNode> = TNode extends SlashSubcommandDefinitionBase
  ? true
  : TNode extends { subcommands: infer TChildren }
    ? TNode extends { execute: (...arguments_: never[]) => unknown }
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['executableGroup']>
      : TNode extends { options: unknown }
        ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['mixedOptions']>
        : ValidateNestedLeaves<TChildren>
    : TNode extends { execute: (...arguments_: never[]) => unknown }
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['helperFreeLeaf']>
      : RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['invalidNode']>

type ValidateRootNodes<TNodes> =
  TNodes extends Record<PropertyKey, unknown>
    ? keyof TNodes extends never
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['emptySubcommands']>
      : HasMoreThan25Keys<TNodes> extends true
        ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['tooManySubcommands']>
        : CollectValidationErrors<
            { [Name in keyof TNodes]: ValidateRootNode<TNodes[Name]> }[keyof TNodes]
          >
    : RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['invalidNode']>

/** Produces the definition or a friendly property-level error for an invalid command shape. */
export type ValidateSlashCommandDefinition<TDefinition> = TDefinition extends {
  subcommands: infer TSubcommands
}
  ? TDefinition extends { execute: (...arguments_: never[]) => unknown }
    ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['rootExecute']>
    : TDefinition extends { options: unknown }
      ? RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['mixedOptions']>
      : ValidateRootNodes<TSubcommands>
  : TDefinition extends { execute: (...arguments_: never[]) => unknown }
    ? true
    : RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['missingRootExecute']>

export type SlashCommandInput<
  TApp,
  TOptions extends SlashCommandValueOptionRecord,
  TSubcommands extends Record<string, unknown> | undefined
> = SlashCommandMetadata<TApp> & {
  options?: TOptions
  subcommands?: TSubcommands
} & ([TSubcommands] extends [undefined]
    ? {
        execute(context: SlashCommandContext<TApp, TOptions>): Promise<void>
        subcommands?: undefined
      }
    : {
        execute?: RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['rootExecute']>
        options?: RosepackTypeError<(typeof ROSEPACK_TYPE_MESSAGES)['mixedOptions']>
        subcommands: TSubcommands &
          (ValidateRootNodes<TSubcommands> extends true ? unknown : ValidateRootNodes<TSubcommands>)
      })

export type SlashCommandInputResult<
  TApp,
  TOptions extends SlashCommandValueOptionRecord,
  TSubcommands extends Record<string, unknown> | undefined
> = [TSubcommands] extends [Record<string, unknown>]
  ? SlashSubcommandCommandDefinition<TApp, Extract<TSubcommands, SlashSubcommandRecord<TApp>>>
  : SlashCommandDefinition<TApp, TOptions>

/** Any source definition represented by a node in a registry tree. */
export type SlashCommandTreeDefinition<TApp = unknown> =
  | SlashRootCommandDefinitionBase<TApp>
  | SlashSubcommandDefinitionBase<TApp>
  | SlashSubcommandGroupDefinition<TApp>

/** An immutable, searchable view of one command, group, or executable leaf. */
export interface SlashCommandTreeNode<TApp = unknown> {
  readonly children: readonly SlashCommandTreeNode<TApp>[]
  readonly definition: SlashCommandTreeDefinition<TApp>
  readonly description: string
  readonly executable: boolean
  readonly name: string
  readonly path: readonly string[]
}

export function createSubcommandDefinition<
  TApp,
  const TOptions extends SlashCommandValueOptionRecord
>(definition: SlashSubcommandInput<TApp, TOptions>): SlashSubcommandDefinition<TApp, TOptions> {
  const result = {
    ...definition,
    [slashSubcommandBrand]: true
  } satisfies SlashSubcommandDefinition<TApp, TOptions>
  setSlashSubcommandExecutor(result, async (context) =>
    definition.execute(context as unknown as SlashCommandContext<TApp, TOptions>)
  )
  return result
}

export function createSlashCommandDefinition<
  TApp,
  const TOptions extends SlashCommandValueOptionRecord = {},
  const TSubcommands extends Record<string, unknown> | undefined = undefined
>(
  definition: SlashCommandInput<TApp, TOptions, TSubcommands>
): SlashCommandInputResult<TApp, TOptions, TSubcommands> {
  const command = definition as SlashRootCommandDefinitionBase<TApp>
  const executable = command as SlashRootCommandDefinitionBase<TApp> & {
    execute?: (context: SlashCommandContext<TApp, SlashCommandValueOptionRecord>) => Promise<void>
  }
  if (executable.execute !== undefined) {
    setSlashCommandExecutor(command, executable.execute as SlashCommandExecutor)
  }
  return command as SlashCommandInputResult<TApp, TOptions, TSubcommands>
}
