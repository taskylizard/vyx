# rosepack

rosepack is a strongly typed slash-command framework for [Oceanic](https://oceanic.ws). It keeps command definitions beside their handlers, gives every handler a typed application context and option values, validates the whole command tree before registration, and exposes that tree for lookup and command-to-command invocation.

## Install

```sh
vp add rosepack oceanic.js
```

rosepack requires Node.js 22 or newer and uses `oceanic.js` as a peer dependency.

## Set up rosepack

Bind your application's services once, then import the resulting helpers in command modules:

```ts
import { createRosepack } from 'rosepack'

interface AppContext {
  notes: NotesService
}

export const rosepack = createRosepack<AppContext>()
export const { defineSlashCommand, subcommand } = rosepack
```

`context.app` is the exact `AppContext` supplied to `registry.dispatch`.

## Define a command

```ts
import { defineSlashCommand } from '../rosepack.ts'

export default defineSlashCommand({
  name: 'ping',
  description: 'Check whether the bot is responding',
  contexts: ['guild', 'botDm', 'privateChannel'],
  installations: ['guild', 'user'],
  async execute(context) {
    await context.reply('Pong!')
  }
})
```

The string metadata is converted to Discord's numeric context and installation values when the registration payload is built.

## Options

Options are inferred on `context.options`, including required values and literal choices:

```ts
export default defineSlashCommand({
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

Executable leaves use `subcommand()`. Plain nested objects represent Discord subcommand groups:

```ts
export default defineSlashCommand({
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

rosepack's types reject executable groups, root handlers on routed commands, helper-free leaves, empty groups, and nesting beyond Discord's command → group → subcommand limit. The same rules are linted at runtime when a registry is created.

## Hooks and responses

Commands may define `beforeExecute(context)` and `onError(context, error)`. Context response helpers include `defer`, `reply`, `editResponse`, `followUp`, and `deleteResponse`. `reply` edits an acknowledged interaction and creates the initial response otherwise, so handlers do not need to branch on acknowledgement state.

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

`dispatch` ignores non-command interactions. An unknown chat-input command calls `onUnknownCommand` when configured.

## Inspect and invoke commands

The immutable `registry.tree` contains every command node. Use `registry.get('ping')`, `registry.get(commandDefinition)`, or `registry.resolve('/notes admin clear')` to find a node.

Inside a handler, the same registry is available as `context.registry`; `context.command` is the root node and `context.node` is the current leaf. Invoke another registered executable definition or node with:

```ts
await context.invoke(otherCommand, { requiredOption: 'value' })
```

rosepack validates invocation options and rejects recursive invocation.

## Validation

`createRegistry` throws `CommandTreeValidationError` before any Discord API call if the tree is invalid. Its `issues` property contains stable codes, paths, and human-readable messages. `lintSlashCommandTree(commands)` returns those issues without throwing, while `slashCommandToDiscord(command)` builds one validated Discord payload.

## API

The primary exports are `createRosepack`, `SlashCommandContext`, `SlashCommandRegistry`, `CommandTreeValidationError`, `lintSlashCommandTree`, `slashCommandToDiscord`, and the command/option/tree types. See [`examples/rosepack`](../../examples/rosepack/src) for a complete small bot.
