# rosepack

rosepack is a strongly typed slash-command framework for [Oceanic](https://oceanic.ws). Definitions stay next to their handlers, context and options are typed, and the whole command tree gets validated before registration. You can also look up and invoke commands from that same tree.

## Install

```sh
vp add rosepack oceanic.js
```

Requires Node.js 22 or newer. `oceanic.js` is a peer dependency.

## Set up rosepack

Bind your app services once, then use the helpers in your command modules:

```ts
import { createRosepack } from 'rosepack'

interface AppContext {
  notes: NotesService
}

export const rosepack = createRosepack<AppContext>()
export const { slashCommand, subcommand } = rosepack
```

`context.app` is the exact `AppContext` passed to `registry.dispatch`.

## Define a command

```ts
import { slashCommand } from '../rosepack.ts'

export default slashCommand({
  name: 'ping',
  description: 'Check whether the bot is responding',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],
  async execute(context) {
    await context.reply('Pong!')
  }
})
```

rosepack converts that string metadata to Discord's numeric context and installation values when it builds the registration payload.

## Options

Options are inferred on `context.options`, including required values and literal choices:

```ts
export default slashCommand({
  name: 'greet',
  description: 'Send a greeting',
  options: {
    style: {
      description: 'Greeting style',
      kind: 'string',
      choices: [
        { name: 'Brief', value: 'brief' },
        { name: 'Warm', value: 'warm' }
      ],
      required: true
    }
  },
  async execute(context) {
    await context.reply(context.options.style === 'warm' ? 'Lovely to see you!' : 'Hello!')
  }
})
```

## Subcommands and groups

Use `subcommand()` for executable leaves. Plain nested objects are Discord subcommand groups:

```ts
export default slashCommand({
  name: 'notes',
  description: 'Manage notes',
  subcommands: {
    add: subcommand({
      description: 'Add a note',
      options: {
        content: {
          description: 'Note content',
          kind: 'string',
          required: true
        }
      },
      async execute(context) {
        context.app.notes.add(context.interaction.user.id, context.options.content)
        await context.reply('Saved.')
      }
    }),
    admin: {
      description: 'Administrative note actions',
      subcommands: {
        clear: subcommand({
          description: 'Clear all notes',
          async execute(context) {
            context.app.notes.clear()
            await context.reply('Cleared.')
          }
        })
      }
    }
  }
})
```

The types reject executable groups, root handlers on routed commands, helper-free leaves, empty groups, and anything deeper than Discord's command → group → subcommand limit. The registry checks the same rules at runtime too.

## Hooks and responses

Commands can define `beforeExecute(context)` and `onError(context, error)`. Response helpers include `defer`, `reply`, `editResponse`, `followUp`, and `deleteResponse`.

`reply` edits an acknowledged interaction or creates the initial response if needed. No acknowledgement-state branching in every handler.

## Register and dispatch

```ts
const registry = rosepack.createRegistry(commands)

client.once('ready', async () => {
  await registry.registerGlobal({
    applicationID: client.application.id,
    client
  })
})

client.on('interactionCreate', async (interaction) => {
  await registry.dispatch({ app, interaction })
})
```

`dispatch` ignores non-command interactions. Unknown chat-input commands call `onUnknownCommand` if it is configured.

## Inspect and invoke commands

The immutable `registry.tree` has every command node. Find one with `registry.get('ping')`, `registry.get(commandDefinition)`, or `registry.resolve('/notes admin clear')`.

Inside a handler, the registry is on `context.registry`. `context.command` is the root node and `context.node` is the current leaf. Invoke another registered executable definition or node with:

```ts
await context.invoke(otherCommand, { requiredOption: 'value' })
```

rosepack validates the options and rejects recursive invocation.

## Validation

If the tree is invalid, `createRegistry` throws `CommandTreeValidationError` before any Discord API call. Its `issues` property has stable codes, paths, and readable messages.

`lintSlashCommandTree(commands)` returns the issues without throwing. `slashCommandToDiscord(command)` builds one validated Discord payload.

## API

Main exports: `createRosepack`, `SlashCommandContext`, `SlashCommandRegistry`, `CommandTreeValidationError`, `lintSlashCommandTree`, `slashCommandToDiscord`, and the command/option/tree types.

See [`examples/rosepack`](../../examples/rosepack/src) for a complete small bot.
