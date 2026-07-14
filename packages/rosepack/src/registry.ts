import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  CommandInteraction
} from 'oceanic.js'
import type {
  AnyInteractionGateway,
  ApplicationCommandOptions,
  Client,
  CreateApplicationCommandOptions,
  InteractionOptions
} from 'oceanic.js'
import { SlashCommandContext } from './context.ts'
import {
  createSlashCommandDefinition,
  createSubcommandDefinition,
  type SlashCommandDefinition,
  type SlashCommandInput,
  type SlashCommandInputResult,
  type SlashCommandOptionChoice,
  type SlashCommandOptionKind,
  type SlashCommandOptionValue,
  type SlashCommandTreeDefinition,
  type SlashCommandTreeNode,
  type SlashCommandValueOptionDefinition,
  type SlashCommandValueOptionRecord,
  type SlashRootCommandDefinitionBase,
  type SlashSubcommandDefinition,
  type SlashSubcommandDefinitionBase,
  type SlashSubcommandGroupDefinition,
  type SlashSubcommandInput,
  type SlashSubcommandRecord
} from './commands.ts'
import {
  getSlashCommandExecutor,
  getSlashSubcommandExecutor,
  type SlashCommandExecutor
} from './executors.ts'
import { invocationTrail, invokeRegistryCommand } from './internal.ts'
import { integrationTypeByInstallation, interactionContextTypeByName } from './metadata.ts'
import { CommandTreeValidationError, lintSlashCommandTree } from './validation.ts'

/** Configuration shared by registries created from one rosepack instance. */
export interface RosepackOptions<TApp> {
  /** Called when Discord sends a chat-input command that is not present in the registry. */
  onUnknownCommand?(context: {
    app: TApp
    interaction: CommandInteraction
    registry: SlashCommandRegistry<TApp>
  }): void | Promise<void>
}

/** A validated, frozen, and searchable collection of slash commands. */
export class SlashCommandRegistry<TApp> {
  /** Frozen Discord registration payloads in the same order as the root commands. */
  readonly payload: readonly CreateApplicationCommandOptions[]
  /** Frozen command-tree roots available for inspection and routing. */
  readonly tree: readonly SlashCommandTreeNode<TApp>[]
  readonly #byDefinition: WeakMap<object, SlashCommandTreeNode<TApp>>
  readonly #byPath: ReadonlyMap<string, SlashCommandTreeNode<TApp>>
  readonly #options: RosepackOptions<TApp>

  constructor(config: {
    byDefinition: WeakMap<object, SlashCommandTreeNode<TApp>>
    byPath: ReadonlyMap<string, SlashCommandTreeNode<TApp>>
    options: RosepackOptions<TApp>
    payload: readonly CreateApplicationCommandOptions[]
    tree: readonly SlashCommandTreeNode<TApp>[]
  }) {
    this.#byDefinition = config.byDefinition
    this.#byPath = config.byPath
    this.#options = config.options
    this.payload = config.payload
    this.tree = config.tree
    Object.freeze(this)
  }

  /** Finds a root node by command name or any node by its original definition object. */
  get(name: string): SlashCommandTreeNode<TApp> | undefined
  get(definition: SlashCommandTreeDefinition<TApp>): SlashCommandTreeNode<TApp> | undefined
  get(selector: SlashCommandTreeDefinition<TApp> | string): SlashCommandTreeNode<TApp> | undefined {
    return typeof selector === 'string'
      ? this.#byPath.get(commandPathKey([selector]))
      : this.#byDefinition.get(selector)
  }

  /** Finds a node by path, such as `/memory server show` or an array of segments. */
  resolve(path: readonly string[] | string): SlashCommandTreeNode<TApp> | undefined {
    const segments =
      typeof path === 'string'
        ? path.trim().replace(/^\//u, '').split(/\s+/u).filter(Boolean)
        : path
    return this.#byPath.get(commandPathKey(segments))
  }

  async [invokeRegistryCommand](
    source: SlashCommandContext<TApp, SlashCommandValueOptionRecord>,
    target:
      | SlashCommandDefinition<TApp, SlashCommandValueOptionRecord>
      | SlashCommandTreeNode<TApp>
      | SlashSubcommandDefinition<TApp, SlashCommandValueOptionRecord>,
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
    await this.#execute({
      app: source.app,
      interaction: source.interaction,
      invocationTrail: [...source[invocationTrail], node.definition],
      node,
      options: validatedOptions,
      root
    })
  }

  /**
   * Routes a chat-input interaction to its executable command node.
   *
   * Non-command interactions are ignored. Unknown chat-input commands are
   * forwarded to the optional `onUnknownCommand` callback.
   */
  async dispatch(config: { app: TApp; interaction: AnyInteractionGateway }): Promise<void> {
    const { app, interaction } = config
    if (!(interaction instanceof CommandInteraction) || !interaction.isChatInputCommand()) {
      return
    }
    const root = this.get(interaction.data.name)
    if (root === undefined) {
      await this.#options.onUnknownCommand?.({ app, interaction, registry: this })
      return
    }
    const { node, rawOptions } = resolveInteractionNode(root, interaction.data.options.raw)
    const options = parseSlashValueOptionValues(commandNodeOptions(node), rawOptions, node.path)
    await this.#execute({
      app,
      interaction,
      invocationTrail: [node.definition],
      node,
      options,
      root
    })
  }

  /** Replaces the application's global commands with this registry's payload. */
  async registerGlobal(config: {
    applicationID: string
    client: Client
  }): Promise<Awaited<ReturnType<Client['rest']['applications']['bulkEditGlobalCommands']>>> {
    return config.client.rest.applications.bulkEditGlobalCommands(config.applicationID, [
      ...this.payload
    ])
  }

  async #execute(config: {
    app: TApp
    interaction: CommandInteraction
    invocationTrail: readonly SlashCommandTreeDefinition<TApp>[]
    node: SlashCommandTreeNode<TApp>
    options: Record<string, SlashCommandOptionValue | undefined>
    root: SlashCommandTreeNode<TApp>
  }): Promise<void> {
    const context = new SlashCommandContext({
      app: config.app,
      command: config.root,
      interaction: config.interaction,
      invocationTrail: config.invocationTrail,
      node: config.node,
      options: config.options,
      registry: this
    })
    const rootDefinition = config.root.definition as SlashRootCommandDefinitionBase<TApp>
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

/** A subcommand definition helper bound to an application's context type. */
export interface DefineSubcommand<TApp> {
  <const TOptions extends SlashCommandValueOptionRecord>(
    definition: SlashSubcommandInput<TApp, TOptions> & { options: TOptions }
  ): SlashSubcommandDefinition<TApp, TOptions>
  (
    definition: SlashSubcommandInput<TApp, {}> & { options?: never }
  ): SlashSubcommandDefinition<TApp, {}>
}

/** A root slash-command definition helper bound to an application's context type. */
export interface SlashCommandBuilder<TApp> {
  <
    const TOptions extends SlashCommandValueOptionRecord = {},
    const TSubcommands extends Record<string, unknown> | undefined = undefined
  >(
    definition: SlashCommandInput<TApp, TOptions, TSubcommands>
  ): SlashCommandInputResult<TApp, TOptions, TSubcommands>
}

/** The helpers and registry factory produced by `createRosepack`. */
export interface RosepackInstance<TApp> {
  /** Creates and freezes a validated command registry. */
  createRegistry(
    commands: readonly SlashRootCommandDefinitionBase<TApp>[]
  ): SlashCommandRegistry<TApp>
  /** Defines a root slash command while preserving local option inference. */
  slashCommand: SlashCommandBuilder<TApp>
  /** Defines an executable subcommand while preserving local option inference. */
  subcommand: DefineSubcommand<TApp>
}

/**
 * Creates command helpers bound to an application's service/context type.
 *
 * rosepack stores no application state in the returned object. The generic is
 * used to type `context.app` whenever a registry dispatches an interaction.
 */
export function createRosepack<TApp>(options: RosepackOptions<TApp> = {}): RosepackInstance<TApp> {
  return {
    createRegistry: (commands) => buildSlashCommandTree(commands, options),
    slashCommand: createSlashCommandDefinition as SlashCommandBuilder<TApp>,
    subcommand: createSubcommandDefinition as DefineSubcommand<TApp>
  }
}

/**
 * Validates definitions and builds a frozen registry.
 * @throws {CommandTreeValidationError} when any definition violates rosepack or Discord rules.
 */
export function buildSlashCommandTree<TApp>(
  commands: readonly SlashRootCommandDefinitionBase<TApp>[],
  options: RosepackOptions<TApp> = {}
): SlashCommandRegistry<TApp> {
  const issues = lintSlashCommandTree(commands)
  if (issues.length > 0) {
    throw new CommandTreeValidationError(issues)
  }

  const byDefinition = new WeakMap<object, SlashCommandTreeNode<TApp>>()
  const byPath = new Map<string, SlashCommandTreeNode<TApp>>()
  const tree = commands.map((command) => buildRootNode(command, byDefinition, byPath))
  const payload = deepFreeze(commands.map(commandToDiscordUnchecked))
  JSON.stringify(payload)

  for (const command of commands) {
    freezeCommandDefinition(command)
  }

  return new SlashCommandRegistry({
    byDefinition,
    byPath,
    options,
    payload,
    tree: Object.freeze(tree)
  })
}

/** Validates one command and converts it to an Oceanic registration payload. */
export function slashCommandToDiscord(
  command: SlashRootCommandDefinitionBase<unknown>
): CreateApplicationCommandOptions {
  return buildSlashCommandTree([command]).payload[0]!
}

function buildRootNode<TApp>(
  command: SlashRootCommandDefinitionBase<TApp>,
  byDefinition: WeakMap<object, SlashCommandTreeNode<TApp>>,
  byPath: Map<string, SlashCommandTreeNode<TApp>>
): SlashCommandTreeNode<TApp> {
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

function buildSubcommandNode<TApp>(
  name: string,
  definition: SlashSubcommandDefinitionBase<TApp> | SlashSubcommandGroupDefinition<TApp>,
  parentPath: readonly string[],
  byDefinition: WeakMap<object, SlashCommandTreeNode<TApp>>,
  byPath: Map<string, SlashCommandTreeNode<TApp>>
): SlashCommandTreeNode<TApp> {
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

function freezeTreeNode<TApp>(node: SlashCommandTreeNode<TApp>): SlashCommandTreeNode<TApp> {
  return Object.freeze({
    ...node,
    children: Object.freeze([...node.children]),
    path: Object.freeze([...node.path])
  })
}

function freezeCommandDefinition<TApp>(definition: SlashRootCommandDefinitionBase<TApp>): void {
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

function resolveInteractionNode<TApp>(
  root: SlashCommandTreeNode<TApp>,
  options: InteractionOptions[]
): { node: SlashCommandTreeNode<TApp>; rawOptions: InteractionOptions[] } {
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

function commandNodeExecutor<TApp>(
  node: SlashCommandTreeNode<TApp>
): SlashCommandExecutor | undefined {
  return getSlashCommandExecutor(node.definition) ?? getSlashSubcommandExecutor(node.definition)
}

function commandNodeOptions<TApp>(
  node: SlashCommandTreeNode<TApp>
): SlashCommandValueOptionRecord | undefined {
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
    contexts: command.contexts?.map((context) => interactionContextTypeByName[context]),
    description: command.description,
    integrationTypes: command.installations?.map(
      (installation) => integrationTypeByInstallation[installation]
    ),
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

function commandPathKey(path: readonly string[]): string {
  return path.join('\u0000')
}

function optionKindToDiscordType(kind: SlashCommandOptionKind): ApplicationCommandOptionTypes {
  switch (kind) {
    case 'boolean':
      return ApplicationCommandOptionTypes.BOOLEAN
    case 'integer':
      return ApplicationCommandOptionTypes.INTEGER
    case 'number':
      return ApplicationCommandOptionTypes.NUMBER
    case 'string':
      return ApplicationCommandOptionTypes.STRING
  }
}
