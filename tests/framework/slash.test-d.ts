import { expectTypeOf, test } from 'vite-plus/test'
import {
  defineSlashCommand,
  type FrameworkTypeError,
  type SlashCommandContext,
  type SlashSubcommandDefinition,
  subcommand,
  type ValidateSlashCommandDefinition
} from '../../src/bot/framework.ts'
import askCommand from '../../src/commands/ask.ts'

test('types flat command options and context', () => {
  type AskContext = Parameters<typeof askCommand.execute>[0]

  expectTypeOf<AskContext['options']>().toEqualTypeOf<{
    ephemeral?: boolean
    question: string
  }>()
  expectTypeOf<AskContext>().toExtend<SlashCommandContext>()
  expectTypeOf<AskContext['command']['name']>().toEqualTypeOf<string>()
  expectTypeOf<AskContext['commands']['resolve']>().toBeFunction()
  expectTypeOf<AskContext['invoke']>().toBeFunction()
})

test('maps every option kind and required state', () => {
  defineSlashCommand({
    description: 'Exercise option inference',
    name: 'typed-options',
    options: {
      count: {
        description: 'Required integer',
        kind: 'integer',
        required: true
      },
      enabled: {
        description: 'Optional boolean',
        kind: 'boolean'
      },
      label: {
        description: 'Required string',
        kind: 'string',
        required: true
      },
      ratio: {
        description: 'Optional number',
        kind: 'number'
      }
    },
    async execute({ options }) {
      expectTypeOf(options).toEqualTypeOf<{
        count: number
        enabled?: boolean
        label: string
        ratio?: number
      }>()
    }
  })
})

test('infers options beside each executable subcommand leaf', () => {
  const command = defineSlashCommand({
    description: 'Exercise subcommand inference',
    name: 'typed-subcommands',
    subcommands: {
      clear: subcommand({
        description: 'Clear',
        options: {
          confirm: {
            description: 'Confirm',
            kind: 'boolean',
            required: true
          }
        },
        async execute({ options }) {
          expectTypeOf(options).toEqualTypeOf<{ confirm: boolean }>()
        }
      }),
      mode: subcommand({
        description: 'Choose a mode',
        options: {
          mode: {
            choices: [
              { name: 'Fast', value: 'fast' },
              { name: 'Thorough', value: 'thorough' }
            ],
            description: 'Mode',
            kind: 'string',
            required: true
          }
        },
        async execute({ options }) {
          expectTypeOf(options).toEqualTypeOf<{ mode: 'fast' | 'thorough' }>()
        }
      }),
      server: {
        description: 'Server actions',
        subcommands: {
          show: subcommand({
            description: 'Show',
            async execute({ options }) {
              expectTypeOf(options).toEqualTypeOf<{}>()
              expectTypeOf<keyof typeof options>().toEqualTypeOf<never>()
            }
          })
        }
      }
    }
  })

  expectTypeOf<Parameters<typeof command.subcommands.clear.execute>[0]['options']>().toEqualTypeOf<{
    confirm: boolean
  }>()
  expectTypeOf<
    Parameters<typeof command.subcommands.server.subcommands.show.execute>[0]['options']
  >().toEqualTypeOf<{}>()
})

test('returns exact agent-friendly validation messages', () => {
  type Leaf = SlashSubcommandDefinition<{}>

  type HelperFreeLeaf = {
    description: 'Invalid leaf'
    name: 'invalid-leaf'
    subcommands: {
      show: { description: 'Show'; execute(): Promise<void> }
    }
  }
  expectTypeOf<ValidateSlashCommandDefinition<HelperFreeLeaf>>().toEqualTypeOf<
    FrameworkTypeError<'Executable subcommand leaves must use subcommand({ ... }) so their options can be inferred.'>
  >()

  type ExecutableGroup = {
    description: 'Executable group'
    name: 'executable-group'
    subcommands: {
      server: {
        description: 'Server'
        execute(): Promise<void>
        subcommands: { show: Leaf }
      }
    }
  }
  expectTypeOf<ValidateSlashCommandDefinition<ExecutableGroup>>().toEqualTypeOf<
    FrameworkTypeError<'A subcommand group cannot define execute(). Put execute() on a child subcommand.'>
  >()

  type NestedGroup = {
    description: 'Too deep'
    name: 'too-deep'
    subcommands: {
      server: {
        description: 'Server'
        subcommands: {
          administration: { description: 'Administration'; subcommands: {} }
        }
      }
    }
  }
  expectTypeOf<ValidateSlashCommandDefinition<NestedGroup>>().toEqualTypeOf<
    FrameworkTypeError<'Discord supports only command -> group -> subcommand. Nested subcommand groups are invalid.'>
  >()

  type RootExecute = {
    description: 'Root execute'
    execute(): Promise<void>
    name: 'root-execute'
    subcommands: { show: Leaf }
  }
  expectTypeOf<ValidateSlashCommandDefinition<RootExecute>>().toEqualTypeOf<
    FrameworkTypeError<'A command with subcommands cannot define root execute(). Put execute() on a subcommand leaf.'>
  >()

  type RootOptions = {
    description: 'Root options'
    name: 'root-options'
    options: {}
    subcommands: { show: Leaf }
  }
  expectTypeOf<ValidateSlashCommandDefinition<RootOptions>>().toEqualTypeOf<
    FrameworkTypeError<'A command with subcommands cannot define root options. Put options on executable leaves.'>
  >()

  type MissingExecute = { description: 'Missing'; name: 'missing' }
  expectTypeOf<ValidateSlashCommandDefinition<MissingExecute>>().toEqualTypeOf<
    FrameworkTypeError<'A flat command must define execute().'>
  >()

  type EmptySubcommands = {
    description: 'Empty'
    name: 'empty'
    subcommands: {}
  }
  expectTypeOf<ValidateSlashCommandDefinition<EmptySubcommands>>().toEqualTypeOf<
    FrameworkTypeError<'A command or subcommand group must contain at least one subcommand.'>
  >()
})

test('rejects invalid command definitions at their call sites', () => {
  defineSlashCommand({
    description: 'Invalid leaf',
    name: 'invalid-leaf',
    // @ts-expect-error Executable leaves must use subcommand() for local inference.
    subcommands: {
      show: {
        description: 'Show',
        async execute() {}
      }
    }
  })

  defineSlashCommand({
    description: 'Executable group',
    name: 'executable-group',
    // @ts-expect-error Groups cannot define execute handlers.
    subcommands: {
      server: {
        description: 'Server',
        async execute() {},
        subcommands: {
          show: subcommand({ description: 'Show', async execute() {} })
        }
      }
    }
  })

  defineSlashCommand({
    description: 'Too deep',
    name: 'too-deep',
    // @ts-expect-error Discord groups cannot contain another group.
    subcommands: {
      server: {
        description: 'Server',
        subcommands: {
          administration: {
            description: 'Administration',
            subcommands: {}
          }
        }
      }
    }
  })

  defineSlashCommand({
    description: 'Root execute',
    // @ts-expect-error Routed commands cannot define a root execute handler.
    async execute() {},
    name: 'root-execute',
    subcommands: {
      show: subcommand({ description: 'Show', async execute() {} })
    }
  })
})
