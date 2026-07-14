/** Stable, human-readable messages used by compile-time and runtime validation. */
export const ROSEPACK_TYPE_MESSAGES = {
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
    'A command with subcommands cannot define root execute(). Put execute() on a subcommand leaf.',
  tooManySubcommands: 'Discord allows at most 25 subcommands.'
} as const

/** A readable marker placed at the property responsible for an invalid definition. */
export interface RosepackTypeError<TMessage extends string> {
  readonly $rosepackError: TMessage
}
