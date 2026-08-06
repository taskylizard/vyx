import { afterAll, bench, describe } from 'vite-plus/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { JumbleLibrary } from '../../src/jumble/library.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import type { JumbleCandidate } from '../../src/jumble/types.ts'

describe('warm durable Jumble library', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanikou-library-bench-'))
  const database = createKanikouDatabase({ url: `file:${join(directory, 'bench.db')}` })
  await database.initialize()
  const candidates: JumbleCandidate[] = Array.from({ length: 600 }, (_, rank) => ({
    kind: 'track',
    answer: `Track ${rank}`,
    artistName: `Artist ${rank}`,
    imageUrl: `https://example.test/${rank}.png`
  }))
  const library = new JumbleLibrary(new JumbleRepository(database.db), {
    async getCandidates() {
      return candidates
    },
    async getHints() {
      return []
    }
  })
  await library.get('benchmark-user', 'track', 'benchmark')

  afterAll(async () => {
    library.stop()
    database.close()
    await rm(directory, { force: true, recursive: true })
  })

  bench('reads and validates 600 ranked candidates', async () => {
    await library.get('benchmark-user', 'track', 'benchmark')
  })
})
