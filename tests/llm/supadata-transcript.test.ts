import type { JobResult, Transcript, TranscriptOrJobId } from '@supadata/js'
import { expect, test, vi } from 'vite-plus/test'
import {
  createSupadataTranscriptTool,
  executeSupadataTranscript,
  type SupadataTranscriptClient
} from '../../src/llm/tools/supadata-transcript.ts'
import { createKanikouTools, SUPADATA_TRANSCRIPT_TOOL_NAME } from '../../src/llm/tools/index.ts'

const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const transcript: Transcript = {
  availableLangs: ['en'],
  content: 'Never gonna give you up &amp; let you down. It&#39;s &#x1F3B5;.',
  lang: 'en'
}

test('registers Supadata only when it is configured', () => {
  const client = createClient(transcript)
  const withoutSupadata = createKanikouTools({})
  const withSupadata = createKanikouTools({
    supadata: { apiKey: 'supadata-key', client }
  })

  expect(Object.keys(withoutSupadata)).toEqual([])
  expect(Object.keys(withSupadata)).toEqual([SUPADATA_TRANSCRIPT_TOOL_NAME])
})

test('returns an immediate Supadata transcript through the AI SDK tool', async () => {
  const client = createClient(transcript)
  const transcriptTool = createSupadataTranscriptTool({
    apiKey: 'supadata-key',
    client
  })
  if (transcriptTool.execute === undefined) {
    throw new Error('Supadata transcript tool is not executable.')
  }

  const output = await transcriptTool.execute(
    {
      language: 'en',
      mode: 'native',
      url: videoUrl
    },
    {
      context: {},
      messages: [],
      toolCallId: 'supadata-transcript-call'
    }
  )

  expect(output).toContain('[YouTube Transcript]')
  expect(output).toContain(videoUrl)
  expect(output).toContain("Never gonna give you up & let you down. It's 🎵.")
  expect(client.transcript).toHaveBeenCalledWith({
    lang: 'en',
    mode: 'native',
    text: true,
    url: videoUrl
  })
  expect(client.transcript.getJobStatus).not.toHaveBeenCalled()
})

test('polls a Supadata transcript job until it completes', async () => {
  const client = createClient({ jobId: 'transcript-job' }, [
    { status: 'queued' },
    { status: 'active' },
    { result: transcript, status: 'completed' }
  ])
  let now = 0

  const output = await executeSupadataTranscript(
    { url: videoUrl },
    {
      apiKey: 'supadata-key',
      client,
      now: () => now,
      pollIntervalMs: 25,
      sleep: async (delayMs) => {
        now += delayMs
      },
      timeoutMs: 100
    }
  )

  expect(output).toContain("Never gonna give you up & let you down. It's 🎵.")
  expect(client.transcript).toHaveBeenCalledWith({
    lang: undefined,
    mode: 'auto',
    text: true,
    url: videoUrl
  })
  expect(client.transcript.getJobStatus).toHaveBeenCalledTimes(3)
})

test('reports a failed Supadata transcript job', async () => {
  const client = createClient({ jobId: 'failed-job' }, [
    {
      error: {
        details: 'No captions were found.',
        error: 'transcript-unavailable',
        message: 'Transcript unavailable'
      },
      status: 'failed'
    }
  ])

  await expect(
    executeSupadataTranscript(
      { url: videoUrl },
      {
        apiKey: 'supadata-key',
        client
      }
    )
  ).rejects.toThrow('Supadata transcript job failed-job failed: Transcript unavailable')
})

test('times out a Supadata transcript job', async () => {
  const client = createClient({ jobId: 'slow-job' }, [{ status: 'queued' }, { status: 'active' }])
  let now = 0

  await expect(
    executeSupadataTranscript(
      { url: videoUrl },
      {
        apiKey: 'supadata-key',
        client,
        now: () => now,
        pollIntervalMs: 10,
        sleep: async (delayMs) => {
          now += delayMs
        },
        timeoutMs: 10
      }
    )
  ).rejects.toThrow('Supadata transcript job slow-job timed out after 10ms')
})

function createClient(
  initialResult: TranscriptOrJobId,
  jobResults: JobResult<Transcript>[] = []
): SupadataTranscriptClient {
  const getJobStatus = vi.fn(async () => {
    const result = jobResults.shift()
    if (result === undefined) {
      throw new Error('Unexpected Supadata job status request.')
    }
    return result
  })
  const transcriptRequest = Object.assign(
    vi.fn(async () => initialResult),
    { getJobStatus }
  )
  return { transcript: transcriptRequest }
}
