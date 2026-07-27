import { match } from 'ts-pattern'
import { slash, slashSub } from '../bot/rosepack.ts'
import {
  MEMORY_ENTRY_LIMIT,
  MEMORY_ENTRY_MAX_LENGTH,
  MemoryStoreError,
  type ForgetMemoryResult,
  type MemoryEntry
} from '../memory/markdown-memory.ts'
import { modules } from '../modules.ts'

const RESPONSE_MAX_LENGTH = 1_900
const MEMORY_PREVIEW_MAX_LENGTH = 180

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

    context.app.logger.error('memory command failed', error)
    await context.editResponse('The memory operation failed. Please try again.')
  },
  subcommands: {
    export: slashSub({
      description: 'Download your personal memory as Markdown',
      async execute(context) {
        const markdown = await context.app.memory.exportMarkdown({
          id: context.interaction.user.id,
          kind: 'user'
        })
        await context.editResponse({
          content: 'Here is the requested Markdown memory export.',
          files: [
            {
              contents: Buffer.from(markdown, 'utf8'),
              name: 'kanikou-personal-memory.md'
            }
          ]
        })
      }
    }),
    clear: slashSub({
      description: 'Delete all of your personal memory',
      options: {
        confirm: {
          description: 'Confirm that all personal memory should be deleted',
          kind: 'boolean',
          required: true
        }
      },
      async execute(context) {
        if (!context.options.confirm) {
          await context.editResponse('Nothing was deleted because confirmation was false.')
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
    server: {
      description: "View or manage this server's shared memory",
      subcommands: {
        export: slashSub({
          description: "Download this server's memory as Markdown",
          async execute(context) {
            if (context.interaction.guildID === null) {
              await context.editResponse('Server memory can only be used inside a Discord server.')
              return
            }
            const markdown = await context.app.memory.exportMarkdown({
              id: context.interaction.guildID,
              kind: 'server'
            })
            await context.editResponse({
              content: 'Here is the requested Markdown memory export.',
              files: [
                {
                  contents: Buffer.from(markdown, 'utf8'),
                  name: 'kanikou-server-memory.md'
                }
              ]
            })
          }
        }),
        clear: slashSub({
          description: 'Delete all shared memory for this server',
          options: {
            confirm: {
              description: 'Confirm that all server memory should be deleted',
              kind: 'boolean',
              required: true
            }
          },
          async execute(context) {
            if (context.interaction.guildID === null) {
              await context.editResponse('Server memory can only be used inside a Discord server.')
              return
            }
            if (!context.interaction.memberPermissions?.has('MANAGE_GUILD')) {
              await context.editResponse(
                'You need the Manage Server permission to change server memory.'
              )
              return
            }
            if (!context.options.confirm) {
              await context.editResponse('Nothing was deleted because confirmation was false.')
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
        forget: slashSub({
          description: 'Remove one shared server memory by ID',
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
            if (context.interaction.guildID === null) {
              await context.editResponse('Server memory can only be used inside a Discord server.')
              return
            }
            if (!context.interaction.memberPermissions?.has('MANAGE_GUILD')) {
              await context.editResponse(
                'You need the Manage Server permission to change server memory.'
              )
              return
            }
            const result = await context.app.memory.forget(
              { id: context.interaction.guildID, kind: 'server' },
              context.options.id
            )
            await context.editResponse(formatForgetMemoryResult(result, context.options.id))
          }
        }),
        show: slashSub({
          description: "Show this server's shared memory",
          async execute(context) {
            if (context.interaction.guildID === null) {
              await context.editResponse('Server memory can only be used inside a Discord server.')
              return
            }
            const entries = await context.app.memory.list({
              id: context.interaction.guildID,
              kind: 'server'
            })
            await context.editResponse(formatMemoryList("This server's memory", entries))
          }
        }),
        remember: slashSub({
          description: 'Save shared server memory',
          options: {
            memory: {
              description: 'The information Kanikou should remember for this server',
              kind: 'string',
              maxLength: MEMORY_ENTRY_MAX_LENGTH,
              required: true
            }
          },
          async execute(context) {
            if (context.interaction.guildID === null) {
              await context.editResponse('Server memory can only be used inside a Discord server.')
              return
            }
            if (!context.interaction.memberPermissions?.has('MANAGE_GUILD')) {
              await context.editResponse(
                'You need the Manage Server permission to change server memory.'
              )
              return
            }
            const entry = await context.app.memory.remember(
              { id: context.interaction.guildID, kind: 'server' },
              context.options.memory,
              context.interaction.id
            )
            await context.editResponse(
              `Added server memory \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content)}`
            )
          }
        })
      }
    },
    forget: slashSub({
      description: 'Remove one personal memory by ID',
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
    show: slashSub({
      description: 'Show your saved personal memory',
      async execute(context) {
        const entries = await context.app.memory.list({
          id: context.interaction.user.id,
          kind: 'user'
        })
        await context.editResponse(formatMemoryList('Your personal memory', entries))
      }
    }),
    remember: slashSub({
      description: 'Save a personal memory',
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
          `Remembered \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content)}`
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
      ({ entry }) => `Forgot \`${entry.id.slice(0, 8)}\`: ${previewMemory(entry.content)}`
    )
    .exhaustive()
}

function formatMemoryList(title: string, entries: readonly MemoryEntry[]): string {
  if (entries.length === 0) {
    return `${title} is empty.`
  }

  const lines = [`**${title} (${entries.length}/${MEMORY_ENTRY_LIMIT})**`]
  let responseLength = lines[0]!.length
  for (const entry of entries) {
    const line = `\`${entry.id.slice(0, 8)}\` — ${previewMemory(entry.content)}`
    if (responseLength + line.length + 1 > RESPONSE_MAX_LENGTH) {
      const remaining = entries.length - (lines.length - 1)
      lines.push(`…and ${remaining} more. Use the Export command to download everything.`)
      break
    }
    lines.push(line)
    responseLength += line.length + 1
  }
  return lines.join('\n')
}

function previewMemory(content: string): string {
  const normalized = content.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= MEMORY_PREVIEW_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, MEMORY_PREVIEW_MAX_LENGTH - 1)}…`
}
