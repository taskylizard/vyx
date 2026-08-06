import { afterAll, beforeAll, expect, test } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import { JumbleService } from '../../src/jumble/service.ts'
import type { JumbleCandidate } from '../../src/jumble/types.ts'

let database: ReturnType<typeof createKanikouDatabase>
let service: JumbleService
let candidates: readonly JumbleCandidate[] = []
let hydratedAnswers: string[] = []

beforeAll(async () => {
  database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  service = new JumbleService(
    new JumbleRepository(database.db),
    {
      async getCandidates() {
        return candidates
      },
      async hydrate(candidate) {
        hydratedAnswers.push(candidate.answer)
        return candidate
      },
      async getHints() {
        return []
      }
    },
    { now: () => 1_000, randomIndex: (maxExclusive) => Math.max(0, maxExclusive - 1) }
  )
})

afterAll(() => {
  service.stop()
  database.close()
})

test('fuzzes hostile candidate pools while selecting only an existing playable identity', async () => {
  for (let caseIndex = 0; caseIndex < 64; caseIndex += 1) {
    const answer =
      caseIndex === 63
        ? 'a'.repeat(120)
        : caseIndex % 8 === 0
          ? `宇多田ヒカル ${caseIndex}`
          : `Playable Album ${caseIndex}`
    const playable = {
      kind: 'album' as const,
      answer,
      artistName: `Playable Artist ${caseIndex}`,
      imageUrl: `https://example.test/playable-${caseIndex}.png`
    }
    const fillerCount = caseIndex === 63 ? 640 : caseIndex % 24
    const hostile = [
      { kind: 'artist' as const, answer: 'Wrong Kind', imageUrl: 'https://example.test/wrong.png' },
      { kind: 'album' as const, answer: '', artistName: 'Empty' },
      { kind: 'album' as const, answer: 'x', artistName: 'Short' },
      { kind: 'album' as const, answer: 'x'.repeat(121), artistName: 'Oversized' },
      {
        kind: 'album' as const,
        answer: '----',
        artistName: 'Punctuation',
        imageUrl: 'https://example.test/punctuation.png'
      },
      {
        kind: 'album' as const,
        answer: 'Unsupported Image',
        artistName: 'Protocol',
        imageUrl: 'data:image/png;base64,AAAA'
      },
      ...Array.from({ length: fillerCount }, (_, index) => ({
        kind: 'album' as const,
        answer: `Missing Image ${caseIndex}-${index}`,
        artistName: 'Missing Image Artist'
      }))
    ] satisfies JumbleCandidate[]
    candidates = [...hostile, playable, ...(caseIndex % 5 === 0 ? [playable] : [])]
    hydratedAnswers = []

    // eslint-disable-next-line no-await-in-loop -- tasky: each fuzz case reuses one stateful service and has to finish in order
    const started = await service.start({
      starterUserId: `user-${caseIndex}`,
      guildId: null,
      channelId: `channel-${caseIndex}`,
      kind: 'album',
      username: 'fuzz-profile'
    })

    expect(started.state.session.answer).toBe(answer)
    expect(hydratedAnswers).toEqual([answer])
    // eslint-disable-next-line no-await-in-loop -- tasky: ending the case keeps the next generated channel state isolated
    await service.giveUp(started.state.session.id, `user-${caseIndex}`)
  }
})

test('rejects a concurrent start while foreground hydration is still running', async () => {
  const concurrentDatabase = createKanikouDatabase({ url: ':memory:' })
  await concurrentDatabase.initialize()
  let finishHydration!: () => void
  const hydrationBlocked = new Promise<void>((resolve) => {
    finishHydration = resolve
  })
  let hydrationStarted!: () => void
  const startedHydrating = new Promise<void>((resolve) => {
    hydrationStarted = resolve
  })
  const concurrentService = new JumbleService(
    new JumbleRepository(concurrentDatabase.db),
    {
      async getCandidates() {
        return [
          {
            kind: 'album',
            answer: 'Concurrent Album',
            artistName: 'Concurrent Artist',
            imageUrl: 'https://example.test/concurrent.png'
          }
        ] satisfies readonly JumbleCandidate[]
      },
      async hydrate(candidate) {
        hydrationStarted()
        await hydrationBlocked
        return candidate
      },
      async getHints() {
        return []
      }
    },
    { now: () => 1_000, randomIndex: () => 0 }
  )

  const first = concurrentService.start({
    starterUserId: 'first-user',
    guildId: null,
    channelId: 'shared-channel',
    kind: 'album',
    username: 'profile'
  })
  await startedHydrating
  await expect(
    concurrentService.start({
      starterUserId: 'second-user',
      guildId: null,
      channelId: 'shared-channel',
      kind: 'album',
      username: 'profile'
    })
  ).rejects.toMatchObject({ code: 'busy' })

  finishHydration()
  await expect(first).resolves.toMatchObject({ action: 'started' })
  concurrentService.stop()
  concurrentDatabase.close()
})
