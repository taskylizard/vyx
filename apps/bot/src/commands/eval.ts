import { defineSlashCommand, Embed, logger, splitMessage } from '#framework'
import { bold, code as inlineCode, codeblock, italic } from 'discord-md-tags'
import assert from 'node:assert'
import { inspect } from 'node:util'
import { ApplicationCommandOptionTypes } from 'oceanic.js'
import ms from 'pretty-ms'
import pyodideModule from 'pyodide/pyodide.js'

const nsInMs = 1_000_000
let lastResult = null
const times: {
  /** Timestamp of when the script began in nanoseconds. */
  start?: bigint
  /** Timestamp of when the script ended in nanoseconds. */
  end?: bigint
  /** Duration of script execution time in nanoseconds. */
  diff?: bigint
} = {}
const evalLogger = logger.withTag('Eval')
let pyodide: any | null = null

export default defineSlashCommand({
  name: 'eval',
  description: 'eval deez nuts',
  guildOnly: true,
  ownerOnly: true,
  guilds: ['962733982296997978'],
  options: [
    {
      name: 'code',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'Code to evaluate.',
      required: false
    },
    {
      name: 'type',
      type: ApplicationCommandOptionTypes.STRING,
      choices: [
        { name: 'JavaScript', value: 'js' },
        { name: 'Python', value: 'py' }
      ],
      description: 'The language to evaluate the code in.',
      required: false
    },
    {
      name: 'packages',
      type: ApplicationCommandOptionTypes.STRING,
      description: 'Python packages to install, separated by commas.',
      required: false
    }
  ],
  async run(ctx) {
    const code = ctx.options.getString('code', false)
    const language = ctx.options.getString('type', false)
    const pyPackages = ctx.options.getString('packages', false)

    function formatResult(
      result: string,
      executionTimeNanoseconds: bigint,
      input?: string
    ): string[] {
      const inspected = ctx.client.redactSecrets(inspect(result, { depth: 0 }))

      const lines = inspected.split('\n')
      const lastIndex = inspected.length - 1
      const prependPart = !(
          inspected.startsWith('{') ||
          inspected.startsWith('[') ||
          inspected.startsWith("'")
        )
        ? lines[0]
        : inspected[0]
      const appendPart = inspected[lastIndex] !== '}' &&
          inspected[lastIndex] !== ']' &&
          inspected[lastIndex] !== "'"
        ? lines[lines.length - 1]
        : inspected[lastIndex]
      const prepend = `\`\`\`javascript\n${prependPart}\n`
      const append = `\n${appendPart}\n\`\`\``
      if (input) {
        return splitMessage(
          [
            italic`Executed in ${
              ms(
                Number(executionTimeNanoseconds) / nsInMs
              )
            }.`,
            codeblock('javascript')`${inspected}`
          ].join('\n'),
          {
            maxLength: 1900,
            prepend,
            append
          }
        )
      }

      return splitMessage(
        [
          italic`Callback executed after ${
            ms(
              Number(executionTimeNanoseconds) / nsInMs
            )
          }.`,
          codeblock('javascript')`${inspected}`
        ].join('\n'),
        {
          maxLength: 1900,
          prepend,
          append
        }
      )
    }

    if (!code) {
      const description =
        // biome-ignore lint/complexity/noUselessStringConcat: what's the point of this, they said
        'JavaScript code to evaluate.\n' +
        bold`Scoped variables:` +
        '\n' +
        '- ' +
        inlineCode`_ctx` +
        '- The context of the command.\n' +
        '- ' +
        inlineCode`prisma` +
        '- The Prisma client.\n' +
        '- ' +
        inlineCode`prisma.db` +
        '- The Prisma client for the database.\n' +
        '- ' +
        inlineCode`doReply` +
        '- A function to reply to the command with the result.\n'

      return await ctx.reply([
        new Embed().setTitle('Usage').setDescription(description)
      ])
    }

    if (language === 'py') {
      let output = ''
      const packages = pyPackages ? pyPackages.split(',') : []
      // Setup pyodide now
      if (!pyodide) {
        pyodide = await pyodideModule.loadPyodide({
          packages
        })
      } else {
        // Already loaded, just update packages
        await pyodide.loadPackage(packages)
      }

      try {
        output = (await pyodide.runPythonAsync(code)) ?? 'No output'
      } catch (_error) {
        const error = _error as Error
        evalLogger.error('Error while running pyodide:', error)
        output = error.message.trim() ?? 'Errored but no message'
      }
      // Truncate output to 2000 characters
      output = typeof output === 'string' && output.length > 2000
        ? output.slice(0, 2000)
        : output
      return await ctx.reply(output)
    }

    const _ctx = ctx
    // biome-ignore lint/correctness/noUnusedVariables: scoping
    const { prisma, prisma: db, prisma: database } = _ctx.client
    // biome-ignore lint/correctness/noUnusedVariables: scoping
    const doReply = (value: Error | string): void => {
      if (value instanceof Error) {
        _ctx
          .reply(`Callback error: \`${JSON.stringify(value)}\``)
          .catch((error) => {
            evalLogger.error(
              'Error while trying to send message about callback error',
              error
            )
          })
      } else {
        if (!times.diff) {
          assert(times.end)
          assert(times.start)
          times.diff = times.end - times.start
        }

        const results = formatResult(value, times.diff)
        for (const result of results) {
          _ctx.reply(result).catch((error) => {
            evalLogger.error('Error while sending result message', error)
          })
        }
      }
    }
    times.start = process.hrtime.bigint()
    try {
      // biome-ignore lint/security/noGlobalEval:dont care
      lastResult = eval(code)
    } catch (error: unknown) {
      return await ctx.reply(
        [
          'Error while evaluating:',
          codeblock('javascript')`${String(error)}`
        ].join('\n')
      )
    }

    times.end = process.hrtime.bigint()
    times.diff = times.end - times.start

    times.start = process.hrtime.bigint()
    const results = formatResult(lastResult ?? '[no result]', times.diff, code)

    if (Array.isArray(results)) {
      return results.map(async (result) => await ctx.reply(result))
    }

    return await ctx.reply(results)
  }
})
