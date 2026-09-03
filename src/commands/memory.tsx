import { SeparatorSpacingSize } from 'oceanic.js'
import type { EditInteractionContent } from 'oceanic.js'
import { match } from 'ts-pattern'
import { slash } from '../bot/rosepack.ts'
import { ComponentMessage, Container, Separator, TextDisplay } from 'rosepack'
import { guildOnlyGuard, manageGuildGuard } from '../discord/guards.ts'
import {
  MEMORY_ENTRY_LIMIT,
  MEMORY_ENTRY_MAX_LENGTH,
  MemoryStoreError,
  type ForgetMemoryResult,
  type MemoryEntry
} from '../memory/markdown-memory.ts'
import { previewMemory } from '../memory/preview.ts'
import { modules } from '../modules.ts'

const RESPONSE_MAX_LENGTH = 1_900
const MEMORY_PREVIEW_MAX_LENGTH = 180
const guildMemoryGuards = [guildOnlyGuard] as const
const managedMemoryGuards = [manageGuildGuard] as const

export default slash({
  name: 'memory',
  description: "Manage Kanikou's saved memory",
  module: modules.ai,
  contexts: ['guild'],
  installations: ['guild'],
  async beforeExecute(context) {
    await context.defer({ ephemeral: true })
  },
  async onError(context, error) {
    if (error instanceof MemoryStoreError) {
      await context.editResponse(error.message)
      return
    }

    context.app.logger.error('memory command failed', { error })
    await context.editResponse('Could not update memory. Try again.')
  },
  subcommands: {
    export: slash({
      description: 'Download your personal memory as Markdown',
      guards: guildMemoryGuards,
      async execute(context) {
        const markdown = await context.app.memory.exportMarkdown({
          id: context.interaction.user.id,
          kind: 'user'
        })
        await context.editResponse({
          content: 'Here is your Markdown memory export.',
          files: [
            {
              contents: Buffer.from(markdown, 'utf8'),
              name: 'kanikou-personal-memory.md'
            }
          ]
        })
      }
    }),
    clear: slash({
      description: 'Delete all of your personal memory',
      guards: guildMemoryGuards,
      options: {
        confirm: {
          description: 'Confirm that all personal memory should be deleted',
          kind: 'boolean',
          required: true
        }
      },
      async execute(context) {
        if (!context.options.confirm) {
          await context.editResponse(
            'Nothing was deleted.\n-# Run the command again with `confirm` enabled.'
          )
          return
        }
        const count = await context.app.memory.clear({
          id: context.interaction.user.id,
          kind: 'user'
        })
        await context.editResponse(
          count === 0
            ? 'You had no saved personal memory.'
            : `Deleted ${count} personal ${count === 1 ? 'memory' : 'memories'}.`
        )
      }
    }),
    server: slash({
      description: "View or manage this server's shared memory",
      subcommands: {
        export: slash({
          description: "Download this server's memory as Markdown",
          guards: guildMemoryGuards,
          async execute(context) {
            const markdown = await context.app.memory.exportMarkdown({
              id: context.interaction.guildID,
              kind: 'server'
            })
            await context.editResponse({
              content: 'Here is your Markdown memory export.',
              files: [
                {
                  contents: Buffer.from(markdown, 'utf8'),
                  name: 'kanikou-server-memory.md'
                }
              ]
            })
          }
        }),
        clear: slash({
          description: 'Delete all shared memory for this server',
          guards: managedMemoryGuards,
          options: {
            confirm: {
              description: 'Confirm that all server memory should be deleted',
              kind: 'boolean',
              required: true
            }
          },
          async execute(context) {
            if (!context.options.confirm) {
              await context.editResponse(
                'Nothing was deleted.\n-# Run the command again with `confirm` enabled.'
              )
              return
            }
            const count = await context.app.memory.clear({
              id: context.interaction.guildID,
              kind: 'server'
            })
            await context.editResponse(
              count === 0
                ? 'This server had no saved memory.'
                : `Deleted ${count} server ${count === 1 ? 'memory' : 'memories'}.`
            )
          }
        }),
        forget: slash({
          description: 'Remove one shared server memory by ID',
          guards: managedMemoryGuards,
          options: {
            id: {
              description: 'The memory ID shown by /memory server show',
              kind: 'string',
              maxLength: 36,
              minLength: 4,
              required: true
            }
          },
          async execute(context) {
            const result = await context.app.memory.forget(
              { id: context.interaction.guildID, kind: 'server' },
              context.options.id
            )
            await context.editResponse(formatForgetMemoryResult(result, context.options.id))
          }
        }),
        show: slash({
          description: "Show this server's shared memory",
          guards: guildMemoryGuards,
          async execute(context) {
            const entries = await context.app.memory.list({
              id: context.interaction.guildID,
              kind: 'server'
            })
            await context.editResponse(formatMemoryList("This server's memory", entries))
          }
        }),
        remember: slash({
          description: 'Save shared server memory',
          guards: managedMemoryGuards,
          options: {
            memory: {
              description: 'The information Kanikou should remember for this server',
              kind: 'string',
              maxLength: MEMORY_ENTRY_MAX_LENGTH,
              required: true
            }
          },
          async execute(context) {
            const entry = await context.app.memory.remember(
              { id: context.interaction.guildID, kind: 'server' },
              context.options.memory,
              context.interaction.id
            )
            await context.editResponse(
              `Added server memory \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content, MEMORY_PREVIEW_MAX_LENGTH)}`
            )
          }
        })
      }
    }),
    forget: slash({
      description: 'Remove one personal memory by ID',
      guards: guildMemoryGuards,
      options: {
        id: {
          description: 'The memory ID shown by /memory show',
          kind: 'string',
          maxLength: 36,
          minLength: 4,
          required: true
        }
      },
      async execute(context) {
        const result = await context.app.memory.forget(
          { id: context.interaction.user.id, kind: 'user' },
          context.options.id
        )
        await context.editResponse(formatForgetMemoryResult(result, context.options.id))
      }
    }),
    show: slash({
      description: 'Show your saved personal memory',
      guards: guildMemoryGuards,
      async execute(context) {
        const entries = await context.app.memory.list({
          id: context.interaction.user.id,
          kind: 'user'
        })
        await context.editResponse(formatMemoryList('Your personal memory', entries))
      }
    }),
    remember: slash({
      description: 'Save a personal memory',
      guards: guildMemoryGuards,
      options: {
        memory: {
          description: 'The information Kanikou should remember',
          kind: 'string',
          maxLength: MEMORY_ENTRY_MAX_LENGTH,
          required: true
        }
      },
      async execute(context) {
        const entry = await context.app.memory.remember(
          { id: context.interaction.user.id, kind: 'user' },
          context.options.memory,
          context.interaction.id
        )
        await context.editResponse(
          `Remembered \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content, MEMORY_PREVIEW_MAX_LENGTH)}`
        )
      }
    })
  }
})

function formatForgetMemoryResult(result: ForgetMemoryResult, identifier: string): string {
  return match(result)
    .returnType<string>()
    .with({ outcome: 'not-found' }, () => `No memory matched \`${identifier}\`.`)
    .with(
      { outcome: 'ambiguous' },
      () => 'That ID prefix matches multiple memories. Use more characters.'
    )
    .with(
      { outcome: 'forgotten' },
      ({ entry }) =>
        `Forgot \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content, MEMORY_PREVIEW_MAX_LENGTH)}`
    )
    .exhaustive()
}

function formatMemoryList(
  title: string,
  entries: readonly MemoryEntry[]
): EditInteractionContent | string {
  if (entries.length === 0) {
    return `${title} is empty.`
  }

  const header = `**${title} (${entries.length}/${MEMORY_ENTRY_LIMIT})**`
  const lines: string[] = []
  let responseLength = header.length
  for (const entry of entries) {
    const line = `\`${entry.id.slice(0, 8)}\` — ${previewMemory(entry.content, MEMORY_PREVIEW_MAX_LENGTH)}`
    if (responseLength + line.length + 1 > RESPONSE_MAX_LENGTH) {
      lines.push(
        `-# …and ${entries.length - lines.length} more. Use the Export command to download everything.`
      )
      break
    }
    lines.push(line)
    responseLength += line.length + 1
  }

  const tree = (
    <Container>
      <TextDisplay>{header}</TextDisplay>
      <Separator spacing={SeparatorSpacingSize.SMALL} />
      <TextDisplay>{lines.join('\n')}</TextDisplay>
    </Container>
  )

  return ComponentMessage({ children: [tree] })
}
