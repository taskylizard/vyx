import { afterAll, beforeAll, bench, describe } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import type { JumbleMusicProvider } from '../../src/jumble/lastfm.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleTimingSink } from '../../src/jumble/timing.ts'

interface BenchmarkHarness {
  database: ReturnType<typeof createKanikouDatabase>
  service: JumbleService
  iteration: number
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

beforeAll(async () => {
  let serializedBytes = 0
  withTiming = await createHarness((event) => {
    serializedBytes += `jumble timing ${JSON.stringify(event)}`.length
  })
  await warmHarness(withTiming, 25)
  if (serializedBytes === 0) throw new Error('Timing benchmark did not emit events.')
})

afterAll(() => {
  withTiming.service.stop()
  withTiming.database.close()
})

describe('Instrumented Jumble start', () => {
  bench('starts and closes a game with a timing sink', async () => {
    await startAndClose(withTiming)
  })
})

async function createHarness(onTiming?: JumbleTimingSink): Promise<BenchmarkHarness> {
  const database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  return {
    database,
    service: new JumbleService(new JumbleRepository(database.db), provider, {
      onTiming,
      randomIndex: () => 0
    }),
    iteration: 0
  }
}

async function startAndClose(harness: BenchmarkHarness): Promise<void> {
  const iteration = harness.iteration
  harness.iteration += 1
  const userId = `benchmark-user-${iteration}`
  const result = await harness.service.start({
    starterUserId: userId,
    guildId: 'benchmark-guild',
    channelId: `benchmark-channel-${iteration}`,
    kind: 'track',
    username: 'benchmark'
  })
  await harness.service.giveUp(result.state.session.id, userId)
}

async function warmHarness(harness: BenchmarkHarness, remaining: number): Promise<void> {
  if (remaining <= 0) return
  await startAndClose(harness)
  await warmHarness(harness, remaining - 1)
}
