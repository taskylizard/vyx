import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  ApplicationIntegrationTypes,
  CommandInteraction,
  InteractionContextTypes,
  MessageFlags
} from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import {
  CommandTreeValidationError,
  createRosepack,
  SlashCommandContext,
  slashCommandToDiscord,
  type SlashRootCommandDefinitionBase
} from '../src/index.ts'

interface TestApp {
  responder: {
    answerPrompt(app: TestApp, interaction: CommandInteraction, question: string): Promise<void>
  }
}

const rosepack = createRosepack<TestApp>()
const { slashCommand, subcommand } = rosepack

const askCommand = slashCommand({
  name: 'ask',
  description: 'Ask the AI',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],
  options: {
    ephemeral: {
      description: 'Should only you see the answer?',
      kind: 'boolean'
    },
    question: {
      description: 'What do you want to ask?',
      kind: 'string',
      required: true
    }
  },
  async execute(context) {
    const { ephemeral = false, question } = context.options
    await context.defer({ ephemeral })
    await context.app.responder.answerPrompt(context.app, context.interaction, question)
  }
})

const memoryCommand = slashCommand({
  name: 'memory',
  description: 'Manage saved memory',
  subcommands: {
    remember: subcommand({
      description: 'Save a personal memory',
      options: {
        memory: {
          description: 'The information to remember',
          kind: 'string',
          maxLength: 1_000,
          required: true
        }
      },
      async execute() {}
    }),
    server: {
      description: 'View or manage server memory',
      subcommands: {
        remember: subcommand({
          description: 'Save server memory',
          options: {
            memory: {
              description: 'The server information to remember',
              kind: 'string',
              maxLength: 1_000,
              required: true
            }
          },
          async execute() {}
        })
      }
    }
  }
})

test('converts slash command records to Oceanic command payloads', () => {
  expect(slashCommandToDiscord(askCommand)).toEqual({
    contexts: [
      InteractionContextTypes.GUILD,
      InteractionContextTypes.BOT_DM,
      InteractionContextTypes.PRIVATE_CHANNEL
    ],
    description: 'Ask the AI',
    integrationTypes: [
      ApplicationIntegrationTypes.GUILD_INSTALL,
      ApplicationIntegrationTypes.USER_INSTALL
    ],
    name: 'ask',
    options: [
      {
        description: 'What do you want to ask?',
        name: 'question',
        required: true,
        type: ApplicationCommandOptionTypes.STRING
      },
      {
        description: 'Should only you see the answer?',
        name: 'ephemeral',
        required: false,
        type: ApplicationCommandOptionTypes.BOOLEAN
      }
    ],
    type: ApplicationCommandTypes.CHAT_INPUT
  })
})

test('converts typed subcommands and plain object groups', () => {
  const payload = slashCommandToDiscord(memoryCommand)
  if (payload.type !== ApplicationCommandTypes.CHAT_INPUT) {
    throw new Error('Expected a chat input command payload.')
  }

  expect(payload.options).toContainEqual({
    description: 'Save a personal memory',
    name: 'remember',
    options: [
      {
        description: 'The information to remember',
        maxLength: 1_000,
        name: 'memory',
        required: true,
        type: ApplicationCommandOptionTypes.STRING
      }
    ],
    type: ApplicationCommandOptionTypes.SUB_COMMAND
  })
  expect(payload.options).toContainEqual(
    expect.objectContaining({
      description: 'View or manage server memory',
      name: 'server',
      type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
    })
  )
})

test('builds a frozen, searchable command registry', () => {
  const registry = rosepack.createRegistry([askCommand, memoryCommand])
  const memory = registry.get('memory')
  const remember = registry.resolve('/memory server remember')

  expect(memory?.definition).toBe(memoryCommand)
  expect(registry.get(memoryCommand)).toBe(memory)
  expect(registry.get(memoryCommand.subcommands.server.subcommands.remember)).toBe(remember)
  expect(remember?.definition).toBe(memoryCommand.subcommands.server.subcommands.remember)
  expect(remember?.path).toEqual(['memory', 'server', 'remember'])
  expect(remember?.executable).toBe(true)
  expect(Object.isFrozen(registry)).toBe(true)
  expect(Object.isFrozen(registry.tree)).toBe(true)
  expect(Object.isFrozen(registry.payload[0])).toBe(true)
  expect(Object.isFrozen(memoryCommand)).toBe(true)
  expect(Object.isFrozen(memoryCommand.subcommands)).toBe(true)
  expect(Object.isFrozen(memoryCommand.subcommands.server.subcommands.remember.options)).toBe(true)
})

test('dispatches with the current root, leaf, path, registry, and inferred options', async () => {
  const beforeExecute = vi.fn(async (_context: unknown) => undefined)
  const execute = vi.fn(async (_context: unknown) => undefined)
  const command = slashCommand({
    beforeExecute,
    description: 'Test subcommands',
    name: 'subcommand-test',
    subcommands: {
      remember: subcommand({
        description: 'Remember',
        options: {
          memory: {
            description: 'Memory',
            kind: 'string',
            required: true
          }
        },
        execute
      })
    }
  })
  const commands = rosepack.createRegistry([command])
  const interaction = createCommandInteraction('subcommand-test', [
    {
      name: 'remember',
      options: [
        {
          name: 'memory',
          type: ApplicationCommandOptionTypes.STRING,
          value: 'Uses TypeScript'
        }
      ],
      type: ApplicationCommandOptionTypes.SUB_COMMAND
    }
  ])
  const app = createApp()

  await commands.dispatch({ app, interaction })

  const beforeContext = beforeExecute.mock.calls[0]?.[0]
  const executeContext = execute.mock.calls[0]?.[0]
  expect(beforeContext).toBe(executeContext)
  expect(executeContext).toBeInstanceOf(SlashCommandContext)
  expect(executeContext).toMatchObject({
    app,
    command: { name: 'subcommand-test', path: ['subcommand-test'] },
    interaction,
    node: { name: 'remember', path: ['subcommand-test', 'remember'] },
    options: { memory: 'Uses TypeScript' },
    path: ['subcommand-test', 'remember'],
    registry: commands
  })
})

test('routes nested leaves and failures through root hooks', async () => {
  const failure = new Error('leaf failed')
  const onError = vi.fn(async (_context: unknown, _error: unknown) => undefined)
  const command = slashCommand({
    description: 'Grouped subcommands',
    name: 'group-test',
    onError,
    subcommands: {
      server: {
        description: 'Server actions',
        subcommands: {
          fail: subcommand({
            description: 'Fail',
            async execute() {
              throw failure
            }
          })
        }
      }
    }
  })
  const commands = rosepack.createRegistry([command])
  const interaction = createCommandInteraction('group-test', [
    {
      name: 'server',
      options: [{ name: 'fail', type: ApplicationCommandOptionTypes.SUB_COMMAND }],
      type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
    }
  ])
  const app = createApp()

  await commands.dispatch({ app, interaction })

  expect(onError).toHaveBeenCalledOnce()
  expect(onError.mock.calls[0]?.[0]).toMatchObject({
    command: { name: 'group-test' },
    node: { name: 'fail' },
    path: ['group-test', 'server', 'fail']
  })
  expect(onError.mock.calls[0]?.[1]).toBe(failure)
})

test('provides acknowledgement-aware response lifecycle methods', async () => {
  const commands = rosepack.createRegistry([askCommand])
  const root = commands.get('ask')!
  let acknowledged = false
  const defer = vi.fn(async () => {
    acknowledged = true
  })
  const createMessage = vi.fn(async () => {
    acknowledged = true
  })
  const editOriginal = vi.fn(async () => ({}))
  const createFollowup = vi.fn(async () => ({}))
  const deleteOriginal = vi.fn(async () => undefined)
  const interaction = {
    get acknowledged() {
      return acknowledged
    },
    createFollowup,
    createMessage,
    defer,
    deleteOriginal,
    editOriginal
  } as unknown as CommandInteraction
  const app = createApp()
  const context = new SlashCommandContext({
    app,
    command: root,
    interaction,
    node: root,
    options: { question: 'Hello' },
    registry: commands
  })

  await context.reply('First')
  await context.editResponse('Edited')
  await context.defer({ ephemeral: true })
  await context.followUp('More')
  await context.deleteResponse()

  expect(createMessage).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'First', allowedMentions: expect.any(Object) })
  )
  expect(editOriginal).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'Edited', allowedMentions: expect.any(Object) })
  )
  expect(defer).not.toHaveBeenCalled()
  expect(createFollowup).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'More', allowedMentions: expect.any(Object) })
  )
  expect(deleteOriginal).toHaveBeenCalledOnce()
})

test('invokes another registered definition with option validation', async () => {
  const targetExecute = vi.fn(async (_context: unknown) => undefined)
  const target = slashCommand({
    description: 'Target',
    name: 'target',
    options: {
      value: { description: 'Value', kind: 'string', required: true }
    },
    execute: targetExecute
  })
  const source = slashCommand({
    description: 'Source',
    name: 'source',
    async execute(context) {
      await context.invoke(target, { value: 'called' })
    }
  })
  const commands = rosepack.createRegistry([source, target])
  const interaction = createCommandInteraction('source', [])
  const app = createApp()

  await commands.dispatch({ app, interaction })

  expect(targetExecute).toHaveBeenCalledOnce()
  expect(targetExecute.mock.calls[0]?.[0]).toMatchObject({
    command: { name: 'target' },
    node: { name: 'target' },
    options: { value: 'called' },
    path: ['target']
  })
})

test('rejects recursive programmatic invocation', async () => {
  const recursive = slashCommand({
    description: 'Recursive',
    name: 'recursive',
    async execute(context) {
      await context.invoke(recursive, {})
    }
  })
  const commands = rosepack.createRegistry([recursive])
  const app = createApp()

  await expect(
    commands.dispatch({ app, interaction: createCommandInteraction('recursive', []) })
  ).rejects.toThrow('Recursive command invocation detected at "recursive".')
})

test('aggregates runtime lint failures before registration', () => {
  const invalid = [
    {
      description: '',
      name: 'Invalid Name',
      subcommands: {
        show: { description: 'Show', async execute() {} }
      }
    },
    { description: 'Empty', name: 'empty', subcommands: {} },
    {
      description: 'Too many subcommands',
      name: 'too-many-subcommands',
      subcommands: Object.fromEntries(
        Array.from({ length: 26 }, (_, index) => [
          `leaf-${index + 1}`,
          { description: `Leaf ${index + 1}`, async execute() {} }
        ])
      )
    },
    { description: 'Duplicate', name: 'Invalid Name', async execute() {} }
  ] as unknown as readonly SlashRootCommandDefinitionBase<TestApp>[]

  expect(() => rosepack.createRegistry(invalid)).toThrow(CommandTreeValidationError)
  try {
    rosepack.createRegistry(invalid)
  } catch (error) {
    expect(error).toBeInstanceOf(CommandTreeValidationError)
    expect((error as CommandTreeValidationError).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'invalid-name-case',
        'invalid-name',
        'invalid-description',
        'helper-free-leaf',
        'duplicate-command',
        'empty-subcommands',
        'too-many-subcommands',
        'missing-execute'
      ])
    )
    expect((error as Error).message).toContain('Discord command registration was skipped')
  }
})

test("registers the registry's validated cached payload", async () => {
  const commands = rosepack.createRegistry([askCommand])
  const bulkEditGlobalCommands = vi.fn(async () => [{ id: 'registered' }])
  const client = {
    rest: { applications: { bulkEditGlobalCommands } }
  } as unknown as CommandInteraction['client']

  const registered = await commands.registerGlobal({ applicationID: 'application', client })

  expect(bulkEditGlobalCommands).toHaveBeenCalledWith('application', [...commands.payload])
  expect(registered).toEqual([{ id: 'registered' }])
})

test('the ask command defers through context and answers', async () => {
  const answerPrompt = vi.fn(async () => undefined)
  let acknowledged = false
  const defer = vi.fn(async () => {
    acknowledged = true
  })
  const commands = rosepack.createRegistry([askCommand])
  const interaction = createCommandInteraction('ask', [
    {
      name: 'question',
      type: ApplicationCommandOptionTypes.STRING,
      value: 'What is Vite+?'
    },
    { name: 'ephemeral', type: ApplicationCommandOptionTypes.BOOLEAN, value: true }
  ])
  Object.defineProperties(interaction, {
    acknowledged: { get: () => acknowledged },
    defer: { value: defer }
  })
  const app = createApp(answerPrompt)

  await commands.dispatch({ app, interaction })

  expect(defer).toHaveBeenCalledWith(MessageFlags.EPHEMERAL)
  expect(answerPrompt).toHaveBeenCalledWith(app, interaction, 'What is Vite+?')
})

function createApp(answerPrompt = vi.fn(async () => undefined)): TestApp {
  return {
    responder: { answerPrompt }
  }
}

function createCommandInteraction(name: string, raw: unknown[]): CommandInteraction {
  return Object.assign(Object.create(CommandInteraction.prototype), {
    acknowledged: false,
    data: { name, options: { raw } },
    isChatInputCommand: () => true
  }) as CommandInteraction
}
