import { expectTypeOf, test } from 'vite-plus/test'
import {
  createRosepack,
  type RosepackTypeError,
  type SlashCommandContext,
  type SlashSubcommandDefinition,
  type ValidateSlashCommandDefinition
} from '../src/index.ts'

interface TestApp {
  service: 'test'
}

const { slashCommand, subcommand } = createRosepack<TestApp>()

const askCommand = slashCommand({
  name: 'ask',
  description: 'Ask a question',
  options: {
    ephemeral: {
      description: 'Should the response be private?',
      kind: 'boolean'
    },
    question: {
      description: 'What do you want to ask?',
      kind: 'string',
      required: true
    }
  },
  async execute(context) {
    expectTypeOf(context.app).toEqualTypeOf<TestApp>()
  }
})

test('types flat command options and context', () => {
  type AskContext = Parameters<typeof askCommand.execute>[0]

  expectTypeOf<AskContext['options']>().toEqualTypeOf<{
    ephemeral?: boolean
    question: string
  }>()
  expectTypeOf<AskContext>().toExtend<SlashCommandContext<TestApp>>()
  expectTypeOf<AskContext['command']['name']>().toEqualTypeOf<string>()
  expectTypeOf<AskContext['registry']['resolve']>().toBeFunction()
  expectTypeOf<AskContext['invoke']>().toBeFunction()
})

test('maps every option kind and required state', () => {
  slashCommand({
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
  const command = slashCommand({
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
  type Leaf = SlashSubcommandDefinition<TestApp, {}>

  type HelperFreeLeaf = {
    description: 'Invalid leaf'
    name: 'invalid-leaf'
    subcommands: {
      show: { description: 'Show'; execute(): Promise<void> }
    }
  }
  expectTypeOf<ValidateSlashCommandDefinition<HelperFreeLeaf>>().toEqualTypeOf<
    RosepackTypeError<'Executable subcommand leaves must use subcommand({ ... }) so their options can be inferred.'>
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
    RosepackTypeError<'A subcommand group cannot define execute(). Put execute() on a child subcommand.'>
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
    RosepackTypeError<'Discord supports only command -> group -> subcommand. Nested subcommand groups are invalid.'>
  >()

  type RootExecute = {
    description: 'Root execute'
    execute(): Promise<void>
    name: 'root-execute'
    subcommands: { show: Leaf }
  }
  expectTypeOf<ValidateSlashCommandDefinition<RootExecute>>().toEqualTypeOf<
    RosepackTypeError<'A command with subcommands cannot define root execute(). Put execute() on a subcommand leaf.'>
  >()

  type RootOptions = {
    description: 'Root options'
    name: 'root-options'
    options: {}
    subcommands: { show: Leaf }
  }
  expectTypeOf<ValidateSlashCommandDefinition<RootOptions>>().toEqualTypeOf<
    RosepackTypeError<'A command with subcommands cannot define root options. Put options on executable leaves.'>
  >()

  type MissingExecute = { description: 'Missing'; name: 'missing' }
  expectTypeOf<ValidateSlashCommandDefinition<MissingExecute>>().toEqualTypeOf<
    RosepackTypeError<'A flat command must define execute().'>
  >()

  type EmptySubcommands = {
    description: 'Empty'
    name: 'empty'
    subcommands: {}
  }
  expectTypeOf<ValidateSlashCommandDefinition<EmptySubcommands>>().toEqualTypeOf<
    RosepackTypeError<'A command or subcommand group must contain at least one subcommand.'>
  >()

  type TwentySixSubcommandNames = `leaf-${
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23
    | 24
    | 25
    | 26}`
  type TwentySixLeaves = {
    [Name in TwentySixSubcommandNames]: Leaf
  }
  type TwentyFiveLeaves = Omit<TwentySixLeaves, 'leaf-26'>
  type MaximumRootSubcommands = {
    description: 'Maximum root subcommands'
    name: 'maximum-root-subcommands'
    subcommands: TwentyFiveLeaves
  }
  expectTypeOf<ValidateSlashCommandDefinition<MaximumRootSubcommands>>().toEqualTypeOf<true>()

  type TooManyRootSubcommands = {
    description: 'Too many root subcommands'
    name: 'too-many-root-subcommands'
    subcommands: TwentySixLeaves
  }
  expectTypeOf<ValidateSlashCommandDefinition<TooManyRootSubcommands>>().toEqualTypeOf<
    RosepackTypeError<'Discord allows at most 25 subcommands.'>
  >()

  type TooManyNestedSubcommands = {
    description: 'Too many nested subcommands'
    name: 'too-many-nested-subcommands'
    subcommands: {
      server: {
        description: 'Server'
        subcommands: TwentySixLeaves
      }
    }
  }
  expectTypeOf<ValidateSlashCommandDefinition<TooManyNestedSubcommands>>().toEqualTypeOf<
    RosepackTypeError<'Discord allows at most 25 subcommands.'>
  >()
})

test('rejects invalid command definitions at their call sites', () => {
  slashCommand({
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

  slashCommand({
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

  slashCommand({
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

  slashCommand({
    description: 'Root execute',
    // @ts-expect-error Routed commands cannot define a root execute handler.
    async execute() {},
    name: 'root-execute',
    subcommands: {
      show: subcommand({ description: 'Show', async execute() {} })
    }
  })
})
