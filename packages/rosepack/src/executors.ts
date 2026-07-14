import type { SlashCommandContext } from './context.ts'
import type { SlashCommandValueOptionRecord } from './commands.ts'

export type SlashCommandExecutor = (
  context: SlashCommandContext<unknown, SlashCommandValueOptionRecord>
) => Promise<void>

const slashCommandExecutors = new WeakMap<object, SlashCommandExecutor>()
const slashSubcommandExecutors = new WeakMap<object, SlashCommandExecutor>()

export function getSlashCommandExecutor(definition: object): SlashCommandExecutor | undefined {
  return slashCommandExecutors.get(definition)
}

export function getSlashSubcommandExecutor(definition: object): SlashCommandExecutor | undefined {
  return slashSubcommandExecutors.get(definition)
}

export function hasSlashCommandExecutor(definition: object): boolean {
  return slashCommandExecutors.has(definition)
}

export function hasSlashSubcommandExecutor(definition: object): boolean {
  return slashSubcommandExecutors.has(definition)
}

export function setSlashCommandExecutor(definition: object, executor: SlashCommandExecutor): void {
  slashCommandExecutors.set(definition, executor)
}

export function setSlashSubcommandExecutor(
  definition: object,
  executor: SlashCommandExecutor
): void {
  slashSubcommandExecutors.set(definition, executor)
}
