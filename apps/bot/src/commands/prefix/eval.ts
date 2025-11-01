// oxlint-disable no-unused-vars
import { definePrefixCommand, Embed, logger, splitMessage } from '#framework'
import { bold, code as inlineCode, codeblock, italic } from 'discord-md-tags'
import assert from 'node:assert'
import { inspect } from 'node:util'
import ms from 'pretty-ms'
import pyodideModule from 'pyodide/pyodide.js'

const nsInMs = 1_000_000
let lastResult: any = null
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

export default definePrefixCommand({
  name: 'eval',
  description: 'eval deez nuts',
  aliases: ['ev', 'e'],
  guildOnly: true,
  ownerOnly: true,
  guilds: ['962733982296997978'],
  args: {
    type: { type: 'string', defaultValue: 'js' },
    packages: { type: 'string' },
    code: { type: 'rest', required: true }
  } as const,
  usage: 'eval [type:js|py] [packages:pkg1,pkg2] <code>',
  async run(ctx) {
    const { code, type: language, packages: pyPackages } = ctx.args

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

    if (language === 'py') {
      let output = ''
      const packages = pyPackages ? pyPackages.split(',') : []
      if (!pyodide) {
        pyodide = await pyodideModule.loadPyodide({
          packages
        })
      } else {
        await pyodide.loadPackage(packages)
      }

      try {
        output = (await pyodide.runPythonAsync(code)) ?? 'No output'
      } catch (_error) {
        const error = _error as Error
        evalLogger.error('Error while running pyodide:', error)
        output = error.message.trim() ?? 'Errored but no message'
      }
      output = typeof output === 'string' && output.length > 2000
        ? output.slice(0, 2000)
        : output
      return await ctx.reply(output)
    }

    const { prisma, prisma: db, prisma: database } = ctx.client
    const doReply = (value: Error | string): void => {
      if (value instanceof Error) {
        ctx
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
          ctx.reply(result).catch((error) => {
            evalLogger.error('Error while sending result message', error)
          })
        }
      }
    }
    times.start = process.hrtime.bigint()
    try {
      lastResult = new Function(
        'ctx',
        'prisma',
        'db',
        'database',
        'doReply',
        'lastResult',
        code
      )(ctx, prisma, db, database, doReply, lastResult)
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
