import {
  Supadata,
  type GeneralTranscriptParams,
  type JobResult,
  type Transcript,
  type TranscriptOrJobId
} from '@supadata/js'
import { tool, type Tool } from 'ai'
import { sleep } from 'radashi'
import { match, P } from 'ts-pattern'
import { z } from 'zod'

export const SUPADATA_TRANSCRIPT_TOOL_NAME = 'youtubeTranscript'

const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_TIMEOUT_MS = 60_000

const SupadataTranscriptArgsSchema = z.object({
  language: z
    .string()
    .optional()
    .describe('Optional BCP 47 language code for the transcript, such as en or es.'),
  mode: z
    .enum(['native', 'auto', 'generate'])
    .optional()
    .describe(
      'Transcript mode. Native only uses existing captions, auto falls back to generation, and generate always transcribes the media.'
    ),
  url: z
    .url()
    .describe(
      'Public video or media URL. YouTube, TikTok, Instagram, X/Twitter, and direct media files are supported.'
    )
})

export type SupadataTranscriptArgs = z.infer<typeof SupadataTranscriptArgsSchema>

export interface SupadataTranscriptClient {
  transcript: ((params: GeneralTranscriptParams) => Promise<TranscriptOrJobId>) & {
    getJobStatus: (jobId: string) => Promise<JobResult<Transcript>>
  }
}

export interface SupadataTranscriptConfig {
  apiKey: string
  client?: SupadataTranscriptClient
  now?: () => number
  pollIntervalMs?: number
  sleep?: (delayMs: number) => Promise<void>
  timeoutMs?: number
}

export function createSupadataTranscriptTool(
  config: SupadataTranscriptConfig
): Tool<SupadataTranscriptArgs, string> {
  return tool({
    description:
      'Fetch a transcript for a specific public YouTube or social video. Use this for questions about spoken video content, including when direct access from a datacenter IP is unreliable. Cite the source video URL in the answer.',
    execute: async (args) => executeSupadataTranscript(args, config),
    inputSchema: SupadataTranscriptArgsSchema,
    outputSchema: z.string(),
    toModelOutput: ({ output }) => ({
      type: 'text',
      value: output
    })
  })
}

export async function executeSupadataTranscript(
  args: SupadataTranscriptArgs,
  config: SupadataTranscriptConfig
): Promise<string> {
  const client = config.client ?? new Supadata({ apiKey: config.apiKey })
  const transcriptOrJob = await client.transcript({
    lang: args.language,
    mode: args.mode ?? 'auto',
    text: true,
    url: args.url
  })
  const transcript =
    'jobId' in transcriptOrJob
      ? await waitForTranscript(client, transcriptOrJob.jobId, config)
      : transcriptOrJob

  return formatTranscript(args.url, transcript)
}

async function waitForTranscript(
  client: SupadataTranscriptClient,
  jobId: string,
  config: SupadataTranscriptConfig
): Promise<Transcript> {
  const now = config.now ?? Date.now
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const wait = config.sleep ?? sleep
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (pollIntervalMs < 0) {
    throw new Error('Supadata transcript poll interval cannot be negative.')
  }
  if (timeoutMs <= 0) {
    throw new Error('Supadata transcript timeout must be greater than zero.')
  }

  const deadline = now() + timeoutMs
  while (true) {
    // eslint-disable-next-line no-await-in-loop -- tasky: sequential polling, each poll depends on elapsed time and prior job status
    const job = await client.transcript.getJobStatus(jobId)
    const transcript = match(job)
      .returnType<Transcript | undefined>()
      .with({ status: 'completed', result: P.nonNullable }, ({ result }) => result)
      .with({ status: 'completed' }, () => {
        throw new Error(`Supadata transcript job ${jobId} completed without a transcript.`)
      })
      .with({ status: 'failed' }, ({ error }) => {
        const reason = error?.message ?? error?.details ?? 'unknown error'
        throw new Error(`Supadata transcript job ${jobId} failed: ${reason}`)
      })
      .with({ status: P.union('queued', 'active') }, () => undefined)
      .exhaustive()
    if (transcript !== undefined) return transcript

    const remainingMs = deadline - now()
    if (remainingMs <= 0) {
      throw new Error(`Supadata transcript job ${jobId} timed out after ${timeoutMs}ms.`)
    }
    // eslint-disable-next-line no-await-in-loop -- tasky: sequential polling, sleep before the next status check
    await wait(Math.min(pollIntervalMs, remainingMs))
  }
}

function formatTranscript(url: string, transcript: Transcript): string {
  const encodedContent = Array.isArray(transcript.content)
    ? transcript.content.map((chunk) => chunk.text).join(' ')
    : transcript.content
  const content = decodeHtmlEntities(encodedContent)

  return `[YouTube Transcript]\nSource: ${url}\nLanguage: ${transcript.lang}\n\n${content}`
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: '\u00A0',
    quot: '"'
  }

  return value.replaceAll(/&(#(?:x[\dA-F]+|\d+)|amp|apos|gt|lt|nbsp|quot);/giu, (entity, code) => {
    if (typeof code !== 'string') {
      return entity
    }
    if (!code.startsWith('#')) {
      return namedEntities[code.toLowerCase()] ?? entity
    }

    const hexadecimal = code[1]?.toLowerCase() === 'x'
    const codePoint = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10_ffff) {
      return entity
    }

    return String.fromCodePoint(codePoint)
  })
}
