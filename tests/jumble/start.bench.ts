import { afterAll, beforeAll, bench, describe } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import type { JumbleMusicProvider } from '../../src/jumble/lastfm.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleTimingSink } from '../../src/jumble/timing.ts'
import type { JumbleCandidate } from '../../src/jumble/types.ts'

interface BenchmarkHarness {
  database: ReturnType<typeof createKanikouDatabase>
  service: JumbleService
  iteration: number
}

type BenchmarkProvider = JumbleMusicProvider & {
  hydrate?(candidate: JumbleCandidate): Promise<JumbleCandidate>
}

const provider: JumbleMusicProvider = {
  async getCandidates() {
    return [
      {
        kind: 'track',
        answer: 'Cloudy Hollow',
        artistName: 'Pretty Patterns',
        imageUrl: 'https://images.example.test/cloudy-hollow.jpg'
      }
    ]
  },
  async getHints() {
    return [{ kind: 'type', content: 'This is a track.' }]
  }
}

let withTiming: BenchmarkHarness
let coldTail: BenchmarkHarness

beforeAll(async () => {
  let serializedBytes = 0
  withTiming = await createHarness(provider, (event) => {
    serializedBytes += `jumble timing ${JSON.stringify(event)}`.length
  })
  coldTail = await createHarness({
    async getCandidates() {
      return [
        {
          kind: 'album',
          answer: 'Slow Missing Cover',
          artistName: 'Unplayable Artist'
        },
        ...Array.from({ length: 98 }, (_, index) => ({
          kind: 'album' as const,
          answer: `Ready Album ${index}`,
          artistName: `Ready Artist ${index}`,
          imageUrl: `https://images.example.test/ready-${index}.jpg`
        }))
      ]
    },
    async hydrate(candidate) {
      await delay(candidate.imageUrl === undefined ? 40 : 3)
      return candidate
    },
    async getHints() {
      return [{ kind: 'type', content: 'This is an album.' }]
    }
  })
  await warmHarness(withTiming, 25)
  await warmHarness(coldTail, 5, 'album')
  if (serializedBytes === 0) throw new Error('Timing benchmark did not emit events.')
})

afterAll(() => {
  withTiming.service.stop()
  withTiming.database.close()
  coldTail.service.stop()
  coldTail.database.close()
})

describe('Instrumented Jumble start', () => {
  bench('starts and closes a game with a timing sink', async () => {
    await startAndClose(withTiming)
  })

  bench(
    'starts an album when the random first candidate has no artwork',
    async () => {
      await startAndClose(coldTail, 'album')
    },
    { time: 1_500, warmupIterations: 0, warmupTime: 0 }
  )
})

async function createHarness(
  musicProvider: BenchmarkProvider,
  onTiming?: JumbleTimingSink
): Promise<BenchmarkHarness> {
  const database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  return {
    database,
    service: new JumbleService(new JumbleRepository(database.db), musicProvider, {
      onTiming,
      randomIndex: () => 0
    }),
    iteration: 0
  }
}

async function startAndClose(
  harness: BenchmarkHarness,
  kind: 'album' | 'track' = 'track'
): Promise<void> {
  const iteration = harness.iteration
  harness.iteration += 1
  const userId = `benchmark-user-${iteration}`
  const result = await harness.service.start({
    starterUserId: userId,
    guildId: 'benchmark-guild',
    channelId: `benchmark-channel-${iteration}`,
    kind,
    username: 'benchmark'
  })
  await harness.service.giveUp(result.state.session.id, userId)
}

async function warmHarness(
  harness: BenchmarkHarness,
  remaining: number,
  kind: 'album' | 'track' = 'track'
): Promise<void> {
  if (remaining <= 0) return
  await startAndClose(harness, kind)
  await warmHarness(harness, remaining - 1, kind)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
