import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  ApplicationIntegrationTypes,
  CommandInteraction,
  InteractionContextTypes,
  MessageFlags
} from 'oceanic.js'
import { match } from 'ts-pattern'
import type {
  AnyInteractionGateway,
  ApplicationCommandOptions,
  CreateApplicationCommandOptions,
  EditInteractionContent,
  InteractionContent,
  InteractionOptions
} from 'oceanic.js'
import type { BotContext } from './context.ts'

export type SlashCommandOptionKind = 'boolean' | 'integer' | 'number' | 'string'
export type SlashCommandOptionValue = boolean | number | string

export interface SlashCommandOptionChoice<TValue extends number | string = number | string> {
  name: string
  value: TValue
}

export interface SlashCommandValueOptionDefinition {
  choices?: readonly SlashCommandOptionChoice[]
  description: string
  kind: SlashCommandOptionKind
  maxLength?: number
  minLength?: number
  required?: boolean
}

export type SlashCommandOptionDefinition = SlashCommandValueOptionDefinition

export interface SlashCommandValueOptionRecord {
  [name: string]: SlashCommandValueOptionDefinition
}

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

export type SlashCommandOptionValues<TOptions extends SlashCommandValueOptionRecord> = Simplify<
  {
    [Name in RequiredSlashCommandOptionNames<TOptions>]: SlashCommandOptionValueFor<TOptions[Name]>
  } & {
    [Name in OptionalSlashCommandOptionNames<TOptions>]?: SlashCommandOptionValueFor<TOptions[Name]>
  }
>

export const FRAMEWORK_TYPE_MESSAGES = {
  emptySubcommands: 'A command or subcommand group must contain at least one subcommand.',
  executableGroup:
    'A subcommand group cannot define execute(). Put execute() on a child subcommand.',
  helperFreeLeaf:
    'Executable subcommand leaves must use subcommand({ ... }) so their options can be inferred.',
  invalidNode: 'A subcommand node must be an executable subcommand() leaf or a subcommand group.',
  missingRootExecute: 'A flat command must define execute().',
  mixedOptions:
    'A command with subcommands cannot define root options. Put options on executable leaves.',
  nestedGroup:
    'Discord supports only command -> group -> subcommand. Nested subcommand groups are invalid.',
  rootExecute:
    'A command with subcommands cannot define root execute(). Put execute() on a subcommand leaf.'
} as const

export interface FrameworkTypeError<TMessage extends string> {
  readonly $kanikouFrameworkError: TMessage
}

const slashSubcommandBrand = Symbol('kanikou.slash-subcommand')

export interface SlashSubcommandDefinitionBase {
  readonly [slashSubcommandBrand]: true
  description: string
  options?: SlashCommandValueOptionRecord
}

export interface SlashSubcommandDefinition<
  TOptions extends SlashCommandValueOptionRecord = {}
> extends SlashSubcommandDefinitionBase {
  execute(context: SlashCommandContext<TOptions>): Promise<void>
  options?: TOptions
}

export interface SlashSubcommandLeafRecord {
  [name: string]: SlashSubcommandDefinitionBase
}

export interface SlashSubcommandGroupDefinition<
  TSubcommands extends SlashSubcommandLeafRecord = SlashSubcommandLeafRecord
> {
  description: string
  execute?: never
  options?: never
  subcommands: TSubcommands
}

export interface SlashSubcommandRecord {
  [name: string]: SlashSubcommandDefinitionBase | SlashSubcommandGroupDefinition
}

interface SlashSubcommandInput<TOptions extends SlashCommandValueOptionRecord> {
  description: string
  execute(context: SlashCommandContext<TOptions>): Promise<void>
  options?: TOptions
}

export interface SlashCommandMetadata {
  beforeExecute?(context: SlashCommandContext<SlashCommandValueOptionRecord>): void | Promise<void>
  contexts?: InteractionContextTypes[]
  description: string
  integrationTypes?: ApplicationIntegrationTypes[]
  name: string
  onError?(
    context: SlashCommandContext<SlashCommandValueOptionRecord>,
    error: unknown
  ): void | Promise<void>
}

export interface SlashRootCommandDefinitionBase extends SlashCommandMetadata {
  options?: SlashCommandValueOptionRecord
  subcommands?: SlashSubcommandRecord
}

export interface SlashCommandDefinition<
  TOptions extends SlashCommandValueOptionRecord = {}
> extends SlashRootCommandDefinitionBase {
  execute(context: SlashCommandContext<TOptions>): Promise<void>
  options?: TOptions
  subcommands?: never
}

export interface SlashSubcommandCommandDefinition<
  TSubcommands extends SlashSubcommandRecord = SlashSubcommandRecord
> extends SlashRootCommandDefinitionBase {
  execute?: never
  options?: never
  subcommands: TSubcommands
}

type ValidateNestedLeaf<TNode> = TNode extends SlashSubcommandDefinitionBase
  ? true
  : TNode extends { subcommands: unknown }
    ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['nestedGroup']>
    : TNode extends { execute: (...arguments_: never[]) => unknown }
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['helperFreeLeaf']>
      : FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['invalidNode']>

type CollectValidationErrors<TResults> =
  Exclude<TResults, true> extends never ? true : Exclude<TResults, true>

type ValidateNestedLeaves<TNodes> =
  TNodes extends Record<PropertyKey, unknown>
    ? keyof TNodes extends never
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['emptySubcommands']>
      : CollectValidationErrors<
          { [Name in keyof TNodes]: ValidateNestedLeaf<TNodes[Name]> }[keyof TNodes]
        >
    : FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['invalidNode']>

type ValidateRootNode<TNode> = TNode extends SlashSubcommandDefinitionBase
  ? true
  : TNode extends { subcommands: infer TChildren }
    ? TNode extends { execute: (...arguments_: never[]) => unknown }
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['executableGroup']>
      : TNode extends { options: unknown }
        ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['mixedOptions']>
        : ValidateNestedLeaves<TChildren>
    : TNode extends { execute: (...arguments_: never[]) => unknown }
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['helperFreeLeaf']>
      : FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['invalidNode']>

type ValidateRootNodes<TNodes> =
  TNodes extends Record<PropertyKey, unknown>
    ? keyof TNodes extends never
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['emptySubcommands']>
      : CollectValidationErrors<
          { [Name in keyof TNodes]: ValidateRootNode<TNodes[Name]> }[keyof TNodes]
        >
    : FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['invalidNode']>

export type ValidateSlashCommandDefinition<TDefinition> = TDefinition extends {
  subcommands: infer TSubcommands
}
  ? TDefinition extends { execute: (...arguments_: never[]) => unknown }
    ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['rootExecute']>
    : TDefinition extends { options: unknown }
      ? FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['mixedOptions']>
      : ValidateRootNodes<TSubcommands>
  : TDefinition extends { execute: (...arguments_: never[]) => unknown }
    ? true
    : FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['missingRootExecute']>

type SlashCommandInput<
  TOptions extends SlashCommandValueOptionRecord,
  TSubcommands extends Record<string, unknown> | undefined
> = SlashCommandMetadata & {
  options?: TOptions
  subcommands?: TSubcommands
} & ([TSubcommands] extends [undefined]
    ? {
        execute(context: SlashCommandContext<TOptions>): Promise<void>
        subcommands?: undefined
      }
    : {
        execute?: FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['rootExecute']>
        options?: FrameworkTypeError<(typeof FRAMEWORK_TYPE_MESSAGES)['mixedOptions']>
        subcommands: TSubcommands &
          (ValidateRootNodes<TSubcommands> extends true ? unknown : ValidateRootNodes<TSubcommands>)
      })

type SlashCommandInputResult<
  TOptions extends SlashCommandValueOptionRecord,
  TSubcommands extends Record<string, unknown> | undefined
> = [TSubcommands] extends [Record<string, unknown>]
  ? SlashSubcommandCommandDefinition<Extract<TSubcommands, SlashSubcommandRecord>>
  : SlashCommandDefinition<TOptions>

export type SlashCommandTreeDefinition =
  | SlashRootCommandDefinitionBase
  | SlashSubcommandDefinitionBase
  | SlashSubcommandGroupDefinition

export interface SlashCommandTreeNode {
  readonly children: readonly SlashCommandTreeNode[]
  readonly definition: SlashCommandTreeDefinition
  readonly description: string
  readonly executable: boolean
  readonly name: string
  readonly path: readonly string[]
}

export interface CommandTreeValidationIssue {
  code: string
  message: string
  path: readonly string[]
}

export class CommandTreeValidationError extends Error {
  readonly issues: readonly CommandTreeValidationIssue[]

  constructor(issues: readonly CommandTreeValidationIssue[]) {
    super(formatValidationIssues(issues))
    this.name = 'CommandTreeValidationError'
    this.issues = deepFreeze(issues.map((issue) => ({ ...issue, path: [...issue.path] })))
  }
}

const safeAllowedMentions = {
  everyone: false,
  repliedUser: false,
  roles: false,
  users: false
} as const

const invocationTrail = Symbol('kanikou.command-invocation-trail')

export class SlashCommandContext<TOptions extends SlashCommandValueOptionRecord = {}> {
  readonly bot: BotContext
  readonly command: SlashCommandTreeNode
  readonly commands: SlashCommandRegistry
  readonly interaction: CommandInteraction
  readonly node: SlashCommandTreeNode
  readonly options: SlashCommandOptionValues<TOptions>
  readonly path: readonly string[]
  readonly [invocationTrail]: readonly SlashCommandTreeDefinition[]

  constructor(config: {
    bot: BotContext
    command: SlashCommandTreeNode
    commands: SlashCommandRegistry
    interaction: CommandInteraction
    invocationTrail?: readonly SlashCommandTreeDefinition[]
    node: SlashCommandTreeNode
    options: SlashCommandOptionValues<TOptions>
  }) {
    this.bot = config.bot
    this.command = config.command
    this.commands = config.commands
    this.interaction = config.interaction
    this.node = config.node
    this.options = config.options
    this.path = config.node.path
    this[invocationTrail] = config.invocationTrail ?? []
  }

  get client(): BotContext['client'] {
    return this.bot.client
  }

  get acknowledged(): boolean {
    return this.interaction.acknowledged
  }

  async defer(options: number | { ephemeral?: boolean } = {}): Promise<void> {
    if (this.interaction.acknowledged) {
      return
    }
    const flags =
      typeof options === 'number'
        ? options
        : options.ephemeral === true
          ? MessageFlags.EPHEMERAL
          : undefined
    await this.interaction.defer(flags)
  }

  async reply(content: EditInteractionContent | string): Promise<void> {
    await this.editResponse(content)
  }

  async editResponse(content: EditInteractionContent | string): Promise<void> {
    const payload = normalizeResponseContent(content)
    if (this.interaction.acknowledged) {
      await this.interaction.editOriginal(payload)
      return
    }
    await this.interaction.createMessage(payload as InteractionContent)
  }

  async followUp(content: InteractionContent | string): Promise<void> {
    await this.interaction.createFollowup(normalizeResponseContent(content))
  }

  async deleteResponse(): Promise<void> {
    await this.interaction.deleteOriginal()
  }

  async invoke<TTargetOptions extends SlashCommandValueOptionRecord>(
    target: SlashCommandDefinition<TTargetOptions> | SlashSubcommandDefinition<TTargetOptions>,
    options: SlashCommandOptionValues<TTargetOptions>
  ): Promise<void>
  async invoke(
    target: SlashCommandTreeNode,
    options: Readonly<Record<string, SlashCommandOptionValue | undefined>>
  ): Promise<void>
  async invoke(
    target:
      | SlashCommandDefinition<SlashCommandValueOptionRecord>
      | SlashCommandTreeNode
      | SlashSubcommandDefinition<SlashCommandValueOptionRecord>,
    options: Readonly<Record<string, SlashCommandOptionValue | undefined>>
  ): Promise<void> {
    await this.commands.invoke(this, target, options)
  }
}

type SlashCommandExecutor = (
  context: SlashCommandContext<SlashCommandValueOptionRecord>
) => Promise<void>

const slashCommandExecutors = new WeakMap<object, SlashCommandExecutor>()
const slashSubcommandExecutors = new WeakMap<object, SlashCommandExecutor>()

export function subcommand<const TOptions extends SlashCommandValueOptionRecord>(
  definition: SlashSubcommandInput<TOptions> & { options: TOptions }
): SlashSubcommandDefinition<TOptions>
export function subcommand(
  definition: SlashSubcommandInput<{}> & { options?: never }
): SlashSubcommandDefinition<{}>
export function subcommand<const TOptions extends SlashCommandValueOptionRecord>(
  definition: SlashSubcommandInput<TOptions>
): SlashSubcommandDefinition<TOptions> {
  const result = {
    ...definition,
    [slashSubcommandBrand]: true
  } satisfies SlashSubcommandDefinition<TOptions>
  slashSubcommandExecutors.set(result, async (context) =>
    definition.execute(context as unknown as SlashCommandContext<TOptions>)
  )
  return result
}

export function defineSlashCommand<
  const TOptions extends SlashCommandValueOptionRecord = {},
  const TSubcommands extends Record<string, unknown> | undefined = undefined
>(
  definition: SlashCommandInput<TOptions, TSubcommands>
): SlashCommandInputResult<TOptions, TSubcommands> {
  const command = definition as SlashRootCommandDefinitionBase
  const executable = command as SlashRootCommandDefinitionBase & {
    execute?: (context: SlashCommandContext<SlashCommandValueOptionRecord>) => Promise<void>
  }
  if (executable.execute !== undefined) {
    slashCommandExecutors.set(command, executable.execute)
  }
  return command as SlashCommandInputResult<TOptions, TSubcommands>
}

export class SlashCommandRegistry {
  readonly payload: readonly CreateApplicationCommandOptions[]
  readonly tree: readonly SlashCommandTreeNode[]
  readonly #byDefinition: WeakMap<object, SlashCommandTreeNode>
  readonly #byPath: ReadonlyMap<string, SlashCommandTreeNode>

  constructor(config: {
    byDefinition: WeakMap<object, SlashCommandTreeNode>
    byPath: ReadonlyMap<string, SlashCommandTreeNode>
    payload: readonly CreateApplicationCommandOptions[]
    tree: readonly SlashCommandTreeNode[]
  }) {
    this.#byDefinition = config.byDefinition
    this.#byPath = config.byPath
    this.payload = config.payload
    this.tree = config.tree
    Object.freeze(this)
  }

  get(name: string): SlashCommandTreeNode | undefined
  get(definition: SlashCommandTreeDefinition): SlashCommandTreeNode | undefined
  get(selector: SlashCommandTreeDefinition | string): SlashCommandTreeNode | undefined {
    return typeof selector === 'string'
      ? this.#byPath.get(commandPathKey([selector]))
      : this.#byDefinition.get(selector)
  }

  resolve(path: readonly string[] | string): SlashCommandTreeNode | undefined {
    const segments =
      typeof path === 'string'
        ? path.trim().replace(/^\//u, '').split(/\s+/u).filter(Boolean)
        : path
    return this.#byPath.get(commandPathKey(segments))
  }

  async invoke(
    source: SlashCommandContext<SlashCommandValueOptionRecord>,
    target:
      | SlashCommandDefinition<SlashCommandValueOptionRecord>
      | SlashCommandTreeNode
      | SlashSubcommandDefinition<SlashCommandValueOptionRecord>,
    options: Readonly<Record<string, SlashCommandOptionValue | undefined>>
  ): Promise<void> {
    const node = 'definition' in target ? target : this.#byDefinition.get(target)
    if (node === undefined) {
      throw new Error('Cannot invoke a command definition that is not in this registry.')
    }
    if (!node.executable) {
      throw new Error(`Command path "${node.path.join(' ')}" is not executable.`)
    }
    if (source[invocationTrail].includes(node.definition)) {
      throw new Error(`Recursive command invocation detected at "${node.path.join(' ')}".`)
    }
    const validatedOptions = validateResolvedOptionValues(
      commandNodeOptions(node),
      options,
      node.path
    )
    const root = this.get(node.path[0]!)
    if (root === undefined) {
      throw new Error(`Command root "${node.path[0]}" is missing from the registry.`)
    }
    await this.execute({
      bot: source.bot,
      interaction: source.interaction,
      invocationTrail: [...source[invocationTrail], node.definition],
      node,
      options: validatedOptions,
      root
    })
  }

  async dispatch(bot: BotContext, interaction: CommandInteraction): Promise<void> {
    const root = this.get(interaction.data.name)
    if (root === undefined) {
      bot.logger.debug(`received unregistered slash command ${interaction.data.name}`)
      return
    }
    const { node, rawOptions } = resolveInteractionNode(root, interaction.data.options.raw)
    const options = parseSlashValueOptionValues(commandNodeOptions(node), rawOptions, node.path)
    await this.execute({
      bot,
      interaction,
      invocationTrail: [node.definition],
      node,
      options,
      root
    })
  }

  async execute(config: {
    bot: BotContext
    interaction: CommandInteraction
    invocationTrail: readonly SlashCommandTreeDefinition[]
    node: SlashCommandTreeNode
    options: Record<string, SlashCommandOptionValue | undefined>
    root: SlashCommandTreeNode
  }): Promise<void> {
    const context = new SlashCommandContext({
      bot: config.bot,
      command: config.root,
      commands: this,
      interaction: config.interaction,
      invocationTrail: config.invocationTrail,
      node: config.node,
      options: config.options
    })
    const rootDefinition = config.root.definition as SlashRootCommandDefinitionBase
    const executor = commandNodeExecutor(config.node)
    if (executor === undefined) {
      throw new Error(`Command path "${config.node.path.join(' ')}" has no executor.`)
    }

    try {
      await rootDefinition.beforeExecute?.(context)
      await executor(context)
    } catch (error) {
      if (rootDefinition.onError === undefined) {
        throw error
      }
      await rootDefinition.onError(context, error)
    }
  }
}

export function buildSlashCommandTree(
  commands: readonly SlashRootCommandDefinitionBase[]
): SlashCommandRegistry {
  const issues = lintSlashCommandTree(commands)
  if (issues.length > 0) {
    throw new CommandTreeValidationError(issues)
  }

  const byDefinition = new WeakMap<object, SlashCommandTreeNode>()
  const byPath = new Map<string, SlashCommandTreeNode>()
  const tree = commands.map((command) => buildRootNode(command, byDefinition, byPath))
  const payload = deepFreeze(commands.map(commandToDiscordUnchecked))
  JSON.stringify(payload)

  for (const command of commands) {
    freezeCommandDefinition(command)
  }

  return new SlashCommandRegistry({
    byDefinition,
    byPath,
    payload,
    tree: Object.freeze(tree)
  })
}

export function slashCommandToDiscord(
  command: SlashRootCommandDefinitionBase
): CreateApplicationCommandOptions {
  return buildSlashCommandTree([command]).payload[0]!
}

export async function registerSlashCommands(context: BotContext): Promise<void> {
  const registered = await context.client.rest.applications.bulkEditGlobalCommands(
    context.applicationID,
    [...context.commands.payload]
  )
  context.logger.info(`registered ${registered.length} global slash command(s)`)
}

export async function dispatchInteraction(
  context: BotContext,
  interaction: AnyInteractionGateway
): Promise<void> {
  if (!(interaction instanceof CommandInteraction) || !interaction.isChatInputCommand()) {
    return
  }
  await context.commands.dispatch(context, interaction)
}

export function lintSlashCommandTree(
  commands: readonly SlashRootCommandDefinitionBase[]
): CommandTreeValidationIssue[] {
  const issues: CommandTreeValidationIssue[] = []
  const rootNames = new Set<string>()
  if (commands.length > 100) {
    addIssue(issues, [], 'too-many-commands', 'Discord allows at most 100 global commands.')
  }

  for (const command of commands) {
    const path = [command.name]
    validateCommandName(command.name, path, issues)
    validateDescription(command.description, path, issues)
    if (rootNames.has(command.name)) {
      addIssue(issues, path, 'duplicate-command', `Duplicate root command name "${command.name}".`)
    }
    rootNames.add(command.name)

    const hasSubcommands = command.subcommands !== undefined
    const hasExecutor = slashCommandExecutors.has(command)
    if (hasSubcommands) {
      if (hasExecutor || typeof (command as { execute?: unknown }).execute === 'function') {
        addIssue(issues, path, 'root-execute', FRAMEWORK_TYPE_MESSAGES.rootExecute)
      }
      if (command.options !== undefined) {
        addIssue(issues, path, 'mixed-options', FRAMEWORK_TYPE_MESSAGES.mixedOptions)
      }
      validateRootSubcommands(command.subcommands!, path, issues)
      continue
    }

    if (!hasExecutor) {
      addIssue(issues, path, 'missing-execute', FRAMEWORK_TYPE_MESSAGES.missingRootExecute)
    }
    validateOptions(command.options, path, issues)
  }
  return issues
}

function validateRootSubcommands(
  subcommands: SlashSubcommandRecord,
  parentPath: readonly string[],
  issues: CommandTreeValidationIssue[]
): void {
  const entries = Object.entries(subcommands)
  if (entries.length === 0) {
    addIssue(issues, parentPath, 'empty-subcommands', FRAMEWORK_TYPE_MESSAGES.emptySubcommands)
  }
  if (entries.length > 25) {
    addIssue(issues, parentPath, 'too-many-subcommands', 'Discord allows at most 25 subcommands.')
  }
  for (const [name, definition] of entries) {
    const path = [...parentPath, name]
    validateCommandName(name, path, issues)
    validateDescription(definition.description, path, issues)
    if ('subcommands' in definition) {
      if (
        slashSubcommandExecutors.has(definition) ||
        typeof (definition as { execute?: unknown }).execute === 'function'
      ) {
        addIssue(issues, path, 'executable-group', FRAMEWORK_TYPE_MESSAGES.executableGroup)
      }
      if ((definition as { options?: unknown }).options !== undefined) {
        addIssue(issues, path, 'group-options', FRAMEWORK_TYPE_MESSAGES.mixedOptions)
      }
      validateNestedSubcommands(definition.subcommands, path, issues)
      continue
    }
    if (!slashSubcommandExecutors.has(definition)) {
      addIssue(issues, path, 'helper-free-leaf', FRAMEWORK_TYPE_MESSAGES.helperFreeLeaf)
    }
    validateOptions(definition.options, path, issues)
  }
}

function validateNestedSubcommands(
  subcommands: SlashSubcommandLeafRecord,
  parentPath: readonly string[],
  issues: CommandTreeValidationIssue[]
): void {
  const entries = Object.entries(subcommands)
  if (entries.length === 0) {
    addIssue(issues, parentPath, 'empty-subcommands', FRAMEWORK_TYPE_MESSAGES.emptySubcommands)
  }
  if (entries.length > 25) {
    addIssue(issues, parentPath, 'too-many-subcommands', 'Discord allows at most 25 subcommands.')
  }
  for (const [name, definition] of entries) {
    const path = [...parentPath, name]
    validateCommandName(name, path, issues)
    validateDescription(definition.description, path, issues)
    if ('subcommands' in (definition as object)) {
      addIssue(issues, path, 'nested-group', FRAMEWORK_TYPE_MESSAGES.nestedGroup)
      continue
    }
    if (!slashSubcommandExecutors.has(definition)) {
      addIssue(issues, path, 'helper-free-leaf', FRAMEWORK_TYPE_MESSAGES.helperFreeLeaf)
    }
    validateOptions(definition.options, path, issues)
  }
}

function validateOptions(
  options: SlashCommandValueOptionRecord | undefined,
  parentPath: readonly string[],
  issues: CommandTreeValidationIssue[]
): void {
  if (options === undefined) {
    return
  }
  const entries = Object.entries(options)
  if (entries.length > 25) {
    addIssue(issues, parentPath, 'too-many-options', 'Discord allows at most 25 command options.')
  }
  for (const [name, option] of entries) {
    const path = [...parentPath, name]
    validateCommandName(name, path, issues)
    validateDescription(option.description, path, issues)
    if (
      option.minLength !== undefined &&
      option.maxLength !== undefined &&
      option.minLength > option.maxLength
    ) {
      addIssue(
        issues,
        path,
        'invalid-length-range',
        `minLength (${option.minLength}) cannot exceed maxLength (${option.maxLength}).`
      )
    }
    if (
      (option.minLength !== undefined || option.maxLength !== undefined) &&
      option.kind !== 'string'
    ) {
      addIssue(
        issues,
        path,
        'invalid-length-kind',
        'minLength and maxLength are valid only for string options.'
      )
    }
    if (option.choices !== undefined) {
      if (option.choices.length > 25) {
        addIssue(issues, path, 'too-many-choices', 'Discord allows at most 25 option choices.')
      }
      const choiceValues = new Set<string>()
      for (const choice of option.choices) {
        const valueKey = `${typeof choice.value}:${String(choice.value)}`
        if (choiceValues.has(valueKey)) {
          addIssue(issues, path, 'duplicate-choice', `Duplicate choice value "${choice.value}".`)
        }
        choiceValues.add(valueKey)
        if (
          (option.kind === 'string' && typeof choice.value !== 'string') ||
          ((option.kind === 'integer' || option.kind === 'number') &&
            typeof choice.value !== 'number') ||
          option.kind === 'boolean'
        ) {
          addIssue(
            issues,
            path,
            'invalid-choice-type',
            `Choice value "${choice.value}" does not match option kind "${option.kind}".`
          )
        }
      }
    }
  }
}

function validateCommandName(
  name: string,
  path: readonly string[],
  issues: CommandTreeValidationIssue[]
): void {
  if (name.length < 1 || name.length > 32) {
    addIssue(issues, path, 'invalid-name-length', 'Command names must contain 1 to 32 characters.')
  }
  if (name !== name.toLocaleLowerCase()) {
    addIssue(issues, path, 'invalid-name-case', 'Command names must be lowercase.')
  }
  if (!/^[-_\p{Ll}\p{Lm}\p{Lo}\p{N}]+$/u.test(name)) {
    addIssue(
      issues,
      path,
      'invalid-name',
      `Command name "${name}" contains unsupported characters.`
    )
  }
}

function validateDescription(
  description: string,
  path: readonly string[],
  issues: CommandTreeValidationIssue[]
): void {
  if (description.length < 1 || description.length > 100) {
    addIssue(issues, path, 'invalid-description', 'Descriptions must contain 1 to 100 characters.')
  }
}

function addIssue(
  issues: CommandTreeValidationIssue[],
  path: readonly string[],
  code: string,
  message: string
): void {
  issues.push({ code, message, path })
}

function formatValidationIssues(issues: readonly CommandTreeValidationIssue[]): string {
  const details = issues
    .map(
      (issue) => `- ${issue.path.length === 0 ? '<root>' : issue.path.join('.')}: ${issue.message}`
    )
    .join('\n')
  return `Invalid slash command tree:\n\n${details}\n\nDiscord command registration was skipped.`
}

function buildRootNode(
  command: SlashRootCommandDefinitionBase,
  byDefinition: WeakMap<object, SlashCommandTreeNode>,
  byPath: Map<string, SlashCommandTreeNode>
): SlashCommandTreeNode {
  const path = [command.name]
  const children =
    command.subcommands === undefined
      ? []
      : Object.entries(command.subcommands).map(([name, definition]) =>
          buildSubcommandNode(name, definition, path, byDefinition, byPath)
        )
  const node = freezeTreeNode({
    children,
    definition: command,
    description: command.description,
    executable: command.subcommands === undefined,
    name: command.name,
    path
  })
  byDefinition.set(command, node)
  byPath.set(commandPathKey(path), node)
  return node
}

function buildSubcommandNode(
  name: string,
  definition: SlashSubcommandDefinitionBase | SlashSubcommandGroupDefinition,
  parentPath: readonly string[],
  byDefinition: WeakMap<object, SlashCommandTreeNode>,
  byPath: Map<string, SlashCommandTreeNode>
): SlashCommandTreeNode {
  const path = [...parentPath, name]
  const children =
    'subcommands' in definition
      ? Object.entries(definition.subcommands).map(([childName, childDefinition]) =>
          buildSubcommandNode(childName, childDefinition, path, byDefinition, byPath)
        )
      : []
  const node = freezeTreeNode({
    children,
    definition,
    description: definition.description,
    executable: !('subcommands' in definition),
    name,
    path
  })
  byDefinition.set(definition, node)
  byPath.set(commandPathKey(path), node)
  return node
}

function freezeTreeNode(node: SlashCommandTreeNode): SlashCommandTreeNode {
  return Object.freeze({
    ...node,
    children: Object.freeze([...node.children]),
    path: Object.freeze([...node.path])
  })
}

function freezeCommandDefinition(definition: SlashRootCommandDefinitionBase): void {
  deepFreeze(definition)
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return Object.freeze(value)
}

function resolveInteractionNode(
  root: SlashCommandTreeNode,
  options: InteractionOptions[]
): { node: SlashCommandTreeNode; rawOptions: InteractionOptions[] } {
  if (root.executable) {
    return { node: root, rawOptions: options }
  }
  if (options.length !== 1) {
    throw new Error(`Expected exactly one subcommand for "${root.name}".`)
  }
  const selected = options[0]!
  const child = root.children.find((candidate) => candidate.name === selected.name)
  if (child === undefined) {
    throw new Error(`Unknown command path "${[...root.path, selected.name].join(' ')}".`)
  }
  if (selected.type === ApplicationCommandOptionTypes.SUB_COMMAND) {
    if (!child.executable)
      throw new Error(`Command path "${child.path.join(' ')}" is not executable.`)
    return { node: child, rawOptions: selected.options ?? [] }
  }
  if (selected.type !== ApplicationCommandOptionTypes.SUB_COMMAND_GROUP || child.executable) {
    throw new Error(`Command option "${selected.name}" does not match the registered tree.`)
  }
  if (selected.options?.length !== 1) {
    throw new Error(`Expected exactly one subcommand inside "${child.path.join(' ')}".`)
  }
  const nested = selected.options[0]!
  const leaf = child.children.find((candidate) => candidate.name === nested.name)
  if (
    nested.type !== ApplicationCommandOptionTypes.SUB_COMMAND ||
    leaf === undefined ||
    !leaf.executable
  ) {
    throw new Error(`Unknown command path "${[...child.path, nested.name].join(' ')}".`)
  }
  return { node: leaf, rawOptions: nested.options ?? [] }
}

function commandNodeExecutor(node: SlashCommandTreeNode): SlashCommandExecutor | undefined {
  return slashCommandExecutors.get(node.definition) ?? slashSubcommandExecutors.get(node.definition)
}

function commandNodeOptions(node: SlashCommandTreeNode): SlashCommandValueOptionRecord | undefined {
  return 'options' in node.definition ? node.definition.options : undefined
}

function parseSlashValueOptionValues(
  definitions: SlashCommandValueOptionRecord | undefined,
  options: InteractionOptions[],
  path: readonly string[]
): Record<string, SlashCommandOptionValue | undefined> {
  const values: Record<string, SlashCommandOptionValue | undefined> = {}
  for (const option of options) {
    const definition = definitions?.[option.name]
    if (definition === undefined || !('value' in option)) {
      throw new Error(`Unexpected option "${option.name}" for "${path.join(' ')}".`)
    }
    if (option.type !== optionKindToDiscordType(definition.kind)) {
      throw new Error(`Option "${option.name}" has an unexpected type.`)
    }
    values[option.name] = option.value
  }
  return validateResolvedOptionValues(definitions, values, path)
}

function validateResolvedOptionValues(
  definitions: SlashCommandValueOptionRecord | undefined,
  values: Readonly<Record<string, SlashCommandOptionValue | undefined>>,
  path: readonly string[]
): Record<string, SlashCommandOptionValue | undefined> {
  const result = { ...values }
  for (const name of Object.keys(values)) {
    if (definitions?.[name] === undefined) {
      throw new Error(`Unexpected option "${name}" for "${path.join(' ')}".`)
    }
  }
  for (const [name, definition] of Object.entries(definitions ?? {})) {
    const value = values[name]
    if (definition.required === true && value === undefined) {
      throw new Error(`Missing required option "${name}" for "${path.join(' ')}".`)
    }
    if (value === undefined) continue
    const expectedType =
      definition.kind === 'boolean' ? 'boolean' : definition.kind === 'string' ? 'string' : 'number'
    if (typeof value !== expectedType) {
      throw new Error(`Option "${name}" for "${path.join(' ')}" must be a ${expectedType}.`)
    }
    if (
      definition.choices !== undefined &&
      !definition.choices.some((choice) => choice.value === value)
    ) {
      throw new Error(`Option "${name}" for "${path.join(' ')}" has an unsupported value.`)
    }
  }
  return result
}

function commandToDiscordUnchecked(
  command: SlashRootCommandDefinitionBase
): CreateApplicationCommandOptions {
  return {
    contexts: command.contexts,
    description: command.description,
    integrationTypes: command.integrationTypes,
    name: command.name,
    options:
      command.subcommands === undefined
        ? commandValueOptionsToDiscord(command.options)
        : subcommandsToDiscord(command.subcommands),
    type: ApplicationCommandTypes.CHAT_INPUT
  }
}

function subcommandsToDiscord(definitions: SlashSubcommandRecord): ApplicationCommandOptions[] {
  return Object.entries(definitions).map(([name, definition]) => {
    if ('subcommands' in definition) {
      return {
        description: definition.description,
        name,
        options: Object.entries(definition.subcommands).map(([nestedName, nestedDefinition]) => ({
          description: nestedDefinition.description,
          name: nestedName,
          options: commandValueOptionsToDiscord(nestedDefinition.options),
          type: ApplicationCommandOptionTypes.SUB_COMMAND
        })),
        type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
      } as ApplicationCommandOptions
    }
    return {
      description: definition.description,
      name,
      options: commandValueOptionsToDiscord(definition.options),
      type: ApplicationCommandOptionTypes.SUB_COMMAND
    } as ApplicationCommandOptions
  })
}

function commandValueOptionsToDiscord(
  options: SlashCommandValueOptionRecord | undefined
): ApplicationCommandOptions[] | undefined {
  if (options === undefined) return undefined
  return Object.entries(options)
    .sort(([, left], [, right]) => Number(right.required === true) - Number(left.required === true))
    .map(([name, option]) => optionToDiscord(name, option))
}

function optionToDiscord(
  name: string,
  option: SlashCommandValueOptionDefinition
): ApplicationCommandOptions {
  const payload = {
    description: option.description,
    name,
    required: option.required === true,
    type: optionKindToDiscordType(option.kind)
  } as ApplicationCommandOptions & {
    choices?: SlashCommandOptionChoice[]
    maxLength?: number
    minLength?: number
  }
  if (option.choices !== undefined) payload.choices = [...option.choices]
  if (option.kind === 'string' && option.maxLength !== undefined)
    payload.maxLength = option.maxLength
  if (option.kind === 'string' && option.minLength !== undefined)
    payload.minLength = option.minLength
  return payload
}

function normalizeResponseContent(
  content: EditInteractionContent | InteractionContent | string
): EditInteractionContent & InteractionContent {
  if (typeof content === 'string') {
    return { allowedMentions: safeAllowedMentions, content }
  }
  return {
    ...content,
    allowedMentions: content.allowedMentions ?? safeAllowedMentions
  } as EditInteractionContent & InteractionContent
}

function commandPathKey(path: readonly string[]): string {
  return path.join('\u0000')
}

function optionKindToDiscordType(kind: SlashCommandOptionKind): ApplicationCommandOptionTypes {
  return match(kind)
    .with('boolean', () => ApplicationCommandOptionTypes.BOOLEAN)
    .with('integer', () => ApplicationCommandOptionTypes.INTEGER)
    .with('number', () => ApplicationCommandOptionTypes.NUMBER)
    .with('string', () => ApplicationCommandOptionTypes.STRING)
    .exhaustive()
}
