import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  ApplicationIntegrationTypes,
  CommandInteraction,
  InteractionContextTypes,
  MessageFlags
} from 'oceanic.js'
import { expect, test, vi } from 'vite-plus/test'
import type { BotContext } from '../../src/bot/context.ts'
import {
  buildSlashCommandTree,
  CommandTreeValidationError,
  defineSlashCommand,
  dispatchInteraction,
  registerSlashCommands,
  SlashCommandContext,
  slashCommandToDiscord,
  subcommand,
  type SlashRootCommandDefinitionBase
} from '../../src/bot/framework.ts'
import askCommand from '../../src/commands/ask.ts'
import memoryCommand from '../../src/commands/memory.ts'

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
        description: 'The information Kanikou should remember',
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
      description: "View or manage this server's shared memory",
      name: 'server',
      type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
    })
  )
})

test('builds a frozen, searchable command registry', () => {
  const registry = buildSlashCommandTree([askCommand, memoryCommand])
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
  const command = defineSlashCommand({
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
  const commands = buildSlashCommandTree([command])
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
  const bot = createBot(commands)

  await dispatchInteraction(bot, interaction)

  const beforeContext = beforeExecute.mock.calls[0]?.[0]
  const executeContext = execute.mock.calls[0]?.[0]
  expect(beforeContext).toBe(executeContext)
  expect(executeContext).toBeInstanceOf(SlashCommandContext)
  expect(executeContext).toMatchObject({
    bot,
    command: { name: 'subcommand-test', path: ['subcommand-test'] },
    commands,
    interaction,
    node: { name: 'remember', path: ['subcommand-test', 'remember'] },
    options: { memory: 'Uses TypeScript' },
    path: ['subcommand-test', 'remember']
  })
})

test('routes nested leaves and failures through root hooks', async () => {
  const failure = new Error('leaf failed')
  const onError = vi.fn(async (_context: unknown, _error: unknown) => undefined)
  const command = defineSlashCommand({
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
  const commands = buildSlashCommandTree([command])
  const interaction = createCommandInteraction('group-test', [
    {
      name: 'server',
      options: [{ name: 'fail', type: ApplicationCommandOptionTypes.SUB_COMMAND }],
      type: ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
    }
  ])
  const bot = createBot(commands)

  await dispatchInteraction(bot, interaction)

  expect(onError).toHaveBeenCalledOnce()
  expect(onError.mock.calls[0]?.[0]).toMatchObject({
    command: { name: 'group-test' },
    node: { name: 'fail' },
    path: ['group-test', 'server', 'fail']
  })
  expect(onError.mock.calls[0]?.[1]).toBe(failure)
})

test('provides acknowledgement-aware response lifecycle methods', async () => {
  const commands = buildSlashCommandTree([askCommand])
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
  const bot = createBot(commands)
  const context = new SlashCommandContext({
    bot,
    command: root,
    commands,
    interaction,
    node: root,
    options: { question: 'Hello' }
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
  const target = defineSlashCommand({
    description: 'Target',
    name: 'target',
    options: {
      value: { description: 'Value', kind: 'string', required: true }
    },
    execute: targetExecute
  })
  const source = defineSlashCommand({
    description: 'Source',
    name: 'source',
    async execute(context) {
      await context.invoke(target, { value: 'called' })
    }
  })
  const commands = buildSlashCommandTree([source, target])
  const interaction = createCommandInteraction('source', [])
  const bot = createBot(commands)

  await commands.dispatch(bot, interaction)

  expect(targetExecute).toHaveBeenCalledOnce()
  expect(targetExecute.mock.calls[0]?.[0]).toMatchObject({
    command: { name: 'target' },
    node: { name: 'target' },
    options: { value: 'called' },
    path: ['target']
  })
})

test('rejects recursive programmatic invocation', async () => {
  const recursive = defineSlashCommand({
    description: 'Recursive',
    name: 'recursive',
    async execute(context) {
      await context.invoke(recursive, {})
    }
  })
  const commands = buildSlashCommandTree([recursive])
  const bot = createBot(commands)

  await expect(commands.dispatch(bot, createCommandInteraction('recursive', []))).rejects.toThrow(
    'Recursive command invocation detected at "recursive".'
  )
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
    { description: 'Duplicate', name: 'Invalid Name', async execute() {} }
  ] as unknown as readonly SlashRootCommandDefinitionBase[]

  expect(() => buildSlashCommandTree(invalid)).toThrow(CommandTreeValidationError)
  try {
    buildSlashCommandTree(invalid)
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
        'missing-execute'
      ])
    )
    expect((error as Error).message).toContain('Discord command registration was skipped')
  }
})

test("registers the registry's validated cached payload", async () => {
  const commands = buildSlashCommandTree([askCommand])
  const bulkEditGlobalCommands = vi.fn(async () => [{ id: 'registered' }])
  const info = vi.fn()
  const bot = {
    applicationID: 'application',
    client: { rest: { applications: { bulkEditGlobalCommands } } },
    commands,
    logger: { info }
  } as unknown as BotContext

  await registerSlashCommands(bot)

  expect(bulkEditGlobalCommands).toHaveBeenCalledWith('application', [...commands.payload])
  expect(info).toHaveBeenCalledWith('registered 1 global slash command(s)')
})

test('the ask command defers through context and answers', async () => {
  const answerPrompt = vi.fn(async () => undefined)
  let acknowledged = false
  const defer = vi.fn(async () => {
    acknowledged = true
  })
  const commands = buildSlashCommandTree([askCommand])
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
  const bot = {
    ...createBot(commands),
    responder: { answerPrompt }
  } as unknown as BotContext

  await commands.dispatch(bot, interaction)

  expect(defer).toHaveBeenCalledWith(MessageFlags.EPHEMERAL)
  expect(answerPrompt).toHaveBeenCalledWith(bot, interaction, 'What is Vite+?')
})

function createBot(commands: ReturnType<typeof buildSlashCommandTree>): BotContext {
  return {
    commands,
    logger: { debug: vi.fn() }
  } as unknown as BotContext
}

function createCommandInteraction(name: string, raw: unknown[]): CommandInteraction {
  return Object.assign(Object.create(CommandInteraction.prototype), {
    acknowledged: false,
    data: { name, options: { raw } },
    isChatInputCommand: () => true
  }) as CommandInteraction
}
