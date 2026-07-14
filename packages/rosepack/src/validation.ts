import { ROSEPACK_TYPE_MESSAGES } from './errors.ts'
import { hasSlashCommandExecutor, hasSlashSubcommandExecutor } from './executors.ts'
import type {
  SlashRootCommandDefinitionBase,
  SlashSubcommandLeafRecord,
  SlashSubcommandRecord,
  SlashCommandValueOptionRecord
} from './commands.ts'

/** One runtime command-tree lint finding with its stable path and code. */
export interface CommandTreeValidationIssue {
  code: string
  message: string
  path: readonly string[]
}

/** Thrown when registry construction finds one or more invalid command definitions. */
export class CommandTreeValidationError extends Error {
  readonly issues: readonly CommandTreeValidationIssue[]

  constructor(issues: readonly CommandTreeValidationIssue[]) {
    super(formatValidationIssues(issues))
    this.name = 'CommandTreeValidationError'
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue, path: Object.freeze([...issue.path]) }))
    )
  }
}

/** Returns every command-tree validation issue without throwing or mutating definitions. */
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
    const hasExecutor = hasSlashCommandExecutor(command)
    if (hasSubcommands) {
      if (hasExecutor || typeof (command as { execute?: unknown }).execute === 'function') {
        addIssue(issues, path, 'root-execute', ROSEPACK_TYPE_MESSAGES.rootExecute)
      }
      if (command.options !== undefined) {
        addIssue(issues, path, 'mixed-options', ROSEPACK_TYPE_MESSAGES.mixedOptions)
      }
      validateRootSubcommands(command.subcommands!, path, issues)
      continue
    }

    if (!hasExecutor) {
      addIssue(issues, path, 'missing-execute', ROSEPACK_TYPE_MESSAGES.missingRootExecute)
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
    addIssue(issues, parentPath, 'empty-subcommands', ROSEPACK_TYPE_MESSAGES.emptySubcommands)
  }
  if (entries.length > 25) {
    addIssue(issues, parentPath, 'too-many-subcommands', ROSEPACK_TYPE_MESSAGES.tooManySubcommands)
  }
  for (const [name, definition] of entries) {
    const path = [...parentPath, name]
    validateCommandName(name, path, issues)
    validateDescription(definition.description, path, issues)
    if ('subcommands' in definition) {
      if (
        hasSlashSubcommandExecutor(definition) ||
        typeof (definition as { execute?: unknown }).execute === 'function'
      ) {
        addIssue(issues, path, 'executable-group', ROSEPACK_TYPE_MESSAGES.executableGroup)
      }
      if ((definition as { options?: unknown }).options !== undefined) {
        addIssue(issues, path, 'group-options', ROSEPACK_TYPE_MESSAGES.mixedOptions)
      }
      validateNestedSubcommands(definition.subcommands, path, issues)
      continue
    }
    if (!hasSlashSubcommandExecutor(definition)) {
      addIssue(issues, path, 'helper-free-leaf', ROSEPACK_TYPE_MESSAGES.helperFreeLeaf)
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
    addIssue(issues, parentPath, 'empty-subcommands', ROSEPACK_TYPE_MESSAGES.emptySubcommands)
  }
  if (entries.length > 25) {
    addIssue(issues, parentPath, 'too-many-subcommands', ROSEPACK_TYPE_MESSAGES.tooManySubcommands)
  }
  for (const [name, definition] of entries) {
    const path = [...parentPath, name]
    validateCommandName(name, path, issues)
    validateDescription(definition.description, path, issues)
    if ('subcommands' in (definition as object)) {
      addIssue(issues, path, 'nested-group', ROSEPACK_TYPE_MESSAGES.nestedGroup)
      continue
    }
    if (!hasSlashSubcommandExecutor(definition)) {
      addIssue(issues, path, 'helper-free-leaf', ROSEPACK_TYPE_MESSAGES.helperFreeLeaf)
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
