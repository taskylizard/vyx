import assert from 'node:assert';
import { inspect } from 'node:util';
import { Logger } from '@control.systems/logger';
import { codeblock, italic } from 'discord-md-tags';
import { ApplicationCommandOptionTypes } from 'oceanic.js';
import ms from 'pretty-ms';
import { defineSlashCommand, env, splitMessage } from '#framework';

const NL = '!!NL!!';
const NL_PATTERN = new RegExp(NL, 'g');
/** Number of nanoseconds in a millisecond. */
const nsInMs = 1_000_000;

let lastResult = null;
const times: {
  /** Timestamp of when the script began in nanoseconds. */
  start?: bigint;
  /** Timestamp of when the script ended in nanoseconds. */
  end?: bigint;
  /** Duration of script execution time in nanoseconds. */
  diff?: bigint;
} = {};
const logger = new Logger('Eval');

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
      required: true
    }
  ],
  async run(ctx) {
    const code = ctx.options.getString('code', true);

    const _ctx = ctx;
    // biome-ignore lint/correctness/noUnusedVariables: scoping
    const { prisma, prisma: db, prisma: database } = ctx.client;
    // biome-ignore lint/correctness/noUnusedVariables: scoping
    const doReply = (value: Error | string): void => {
      if (value instanceof Error) {
        _ctx
          .reply(`Callback error: \`${JSON.stringify(value)}\``)
          .catch((error) => {
            logger.error(
              'Error while trying to send message about callback error',
              error
            );
          });
      } else {
        if (!times.diff) {
          assert(times.end);
          assert(times.start);
          times.diff = times.end - times.start;
        }

        const results = formatResult(value, times.diff);
        for (const result of results) {
          _ctx.reply(result).catch((error) => {
            logger.error('Error while sending result message', error);
          });
        }
      }
    };
    times.start = process.hrtime.bigint();
    try {
      // biome-ignore lint/security/noGlobalEval:dont care
      lastResult = eval(code);
    } catch (error: unknown) {
      return await ctx.reply(
        [
          'Error while evaluating:',
          codeblock('javascript')`${String(error)}`
        ].join('\n')
      );
    }

    times.end = process.hrtime.bigint();
    times.diff = times.end - times.start;

    times.start = process.hrtime.bigint();
    const results = formatResult(lastResult ?? '[no result]', times.diff, code);

    if (Array.isArray(results)) {
      return results.map(async (result) => await ctx.reply(result));
    }

    return await ctx.reply(results);
  }
});

function formatResult(
  result: string,
  executionTimeNanoseconds: bigint,
  input?: string
): string[] {
  const inspected = inspect(result, { depth: 0 })
    .replace(NL_PATTERN, '\n')
    .replace(
      new RegExp(
        [
          env.DISCORD_TOKEN,
          env.DATABASE_URL,
          env.REDIS_HOST,
          env.DIVOLT_TOKEN,
          env.INFLUXDB_URL,
          env.INFLUXDB_ADMIN_TOKEN,
          env.LAVALINK_HOST,
          env.ERRORS_WEBHOOK_ID,
          env.ERRORS_WEBHOOK_TOKEN,
          env.REVOLT_TOKEN
        ].join('|'),
        'gi'
      ),
      '[redacted]'
    );

  const lines = inspected.split('\n');
  const lastIndex = inspected.length - 1;
  const prependPart =
    !inspected.startsWith('{') &&
    !inspected.startsWith('[') &&
    !inspected.startsWith("'")
      ? lines[0]
      : inspected[0];
  const appendPart =
    inspected[lastIndex] !== '}' &&
    inspected[lastIndex] !== ']' &&
    inspected[lastIndex] !== "'"
      ? lines[lines.length - 1]
      : inspected[lastIndex];
  const prepend = `\`\`\`javascript\n${prependPart}\n`;
  const append = `\n${appendPart}\n\`\`\``;
  if (input) {
    return splitMessage(
      [
        italic`Executed in ${ms(Number(executionTimeNanoseconds) / nsInMs)}.`,
        codeblock('javascript')`${inspected}`
      ].join('\n'),
      {
        maxLength: 1900,
        prepend,
        append
      }
    );
  }

  return splitMessage(
    [
      italic`Callback executed after ${ms(Number(executionTimeNanoseconds) / nsInMs)}.`,
      codeblock('javascript')`${inspected}`
    ].join('\n'),
    {
      maxLength: 1900,
      prepend,
      append
    }
  );
}
