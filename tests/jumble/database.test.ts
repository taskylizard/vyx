import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { match } from 'ts-pattern'
import { afterEach, beforeEach, expect, test } from 'vite-plus/test'
import { createKanikouDatabase } from '../../src/database/database.ts'
import { jumbleSessions } from '../../src/database/schemas/jumble.ts'
import { componentIds } from '../../src/jumble/components.ts'
import { renderJumble } from '../../src/jumble/discord.ts'
import { buildJumblePayload } from '../../src/jumble/presentation.ts'
import { JumbleRepository } from '../../src/jumble/repository.ts'
import type { JumbleImageRenderer } from '../../src/jumble/renderer.ts'
import { JumbleError, JumbleService } from '../../src/jumble/service.ts'
import type { JumbleTimingEvent } from '../../src/jumble/timing.ts'
import type { JumbleCandidate, JumbleHint, JumbleKind } from '../../src/jumble/types.ts'

let database: ReturnType<typeof createKanikouDatabase>
let service: JumbleService
let repository: JumbleRepository
let now = 1_000

beforeEach(async () => {
  database = createKanikouDatabase({ url: ':memory:' })
  await database.initialize()
  repository = new JumbleRepository(database.db)
  const provider = {
    async getCandidates(kind: JumbleKind): Promise<readonly JumbleCandidate[]> {
      return [
        match(kind)
          .returnType<JumbleCandidate>()
          .with('artist', () => ({
            kind: 'artist',
            answer: 'Björk',
            imageUrl: 'https://example.test/cover.png',
            playcount: 42
          }))
          .with('album', () => ({
            kind: 'album',
            answer: 'Homogenic',
            artistName: 'Björk',
            albumName: 'Homogenic',
            imageUrl: 'https://example.test/cover.png',
            playcount: 42
          }))
          .with('track', () => ({
            kind: 'track',
            answer: 'Jóga',
            albumName: 'Homogenic',
            artistName: 'Björk',
            imageUrl: 'https://example.test/cover.png',
            playcount: 42
          }))
          .exhaustive()
      ]
    },
    async getHints(): Promise<readonly JumbleHint[]> {
      return [
        { kind: 'type', content: 'A hint' },
        { kind: 'artist', content: 'Another hint' },
        { kind: 'plays', content: 'A third hint' },
        { kind: 'extra', content: 'A fourth hint' }
      ]
    }
  }
  service = new JumbleService(repository, provider, {
    now: () => now,
    randomIndex: () => 0
  })
})

afterEach(() => {
  service.stop()
  database.close()
})

test('persists a text-and-art artist session, hints, guesses, and a solved outcome', async () => {
  const started = await service.start({
    starterUserId: 'user-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    kind: 'artist',
    username: 'tasky'
  })
  expect(started.state.session.kind).toBe('artist')
  expect(started.state.session.imageUrl).toBe('https://example.test/cover.png')
  expect(started.state.session.metadata.shuffledAnswer).toBeDefined()
  expect(started.state.session.metadata.shuffledAnswer).toBe(
    started.state.session.metadata.shuffledAnswer?.toUpperCase()
  )
  expect(
    buildJumblePayload(started.state, { componentIds: componentIds(started.state.session.id) })
      .content
  ).toContain('Unscramble:')
  let renderedImage: { stage: number | undefined; url: string } | undefined
  const renderer = {
    async render(url: string, stage?: number) {
      renderedImage = { stage, url }
      return Buffer.from('artist-art')
    },
    async reveal() {
      throw new Error('Active Artist Jumble should keep its artwork pixelated.')
    }
  } as unknown as JumbleImageRenderer
  const rendered = await renderJumble(
    started.state,
    renderer,
    componentIds(started.state.session.id)
  )
  expect(renderedImage).toEqual({ stage: 0, url: 'https://example.test/cover.png' })
  expect(rendered.payload.files).toHaveLength(1)
  expect(rendered.payload.content).toContain('Unscramble:')
  await expect(service.unblur(started.state.session.id)).resolves.toMatchObject({
    action: 'unchanged',
    state: { session: { blurStage: 0 } }
  })
  const finalHint = await service.revealHint(started.state.session.id)
  expect(finalHint.state.session.blurStage).toBe(1)
  await expect(service.unblur(started.state.session.id)).resolves.toMatchObject({
    action: 'updated',
    state: { session: { blurStage: 2 } }
  })
  await expect(service.reshuffle(started.state.session.id)).resolves.toMatchObject({
    action: 'updated',
    state: { session: { reshuffleCount: 1 } }
  })
  const completedHints = await service.getState(started.state.session.id)
  expect(completedHints.hints.filter((hint) => hint.shown)).toHaveLength(4)
  await expect(
    service.start({
      starterUserId: 'user-2',
      guildId: 'guild-1',
      channelId: 'channel-1',
      kind: 'artist',
      username: 'tasky'
    })
  ).rejects.toBeInstanceOf(JumbleError)

  await expect(
    service.submitGuess(started.state.session.id, 'user-2', 'wrong')
  ).resolves.toMatchObject({
    action: 'incorrect'
  })
  now += 1_250
  const solved = await service.submitGuess(started.state.session.id, 'user-2', 'Bjork')
  expect(solved.action).toBe('won')
  expect(solved.state.session.outcome).toBe('won')
  const solvedContent = buildJumblePayload(solved.state, {
    action: solved.action,
    componentIds: componentIds(solved.state.session.id)
  }).content
  expect(solvedContent).toContain('Solved in **1.3s**.')
  expect(solvedContent).toContain(`Unscramble: **${solved.state.session.metadata.shuffledAnswer}**`)
  expect(solvedContent).toContain('**Hints**')
  expect(solvedContent).toContain('• A hint')
  await expect(service.stats('user-1')).resolves.toMatchObject({ played: 1, won: 0 })
  await expect(service.stats('user-2')).resolves.toMatchObject({ played: 1, won: 1 })
})

test('explicit usernames do not replace the saved profile', async () => {
  await service.setProfile('user-1', 'taskyliz')

  await service.start({
    starterUserId: 'user-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    kind: 'album',
    username: 'lastfm'
  })

  await expect(service.getProfile('user-1')).resolves.toBe('taskyliz')
})

test('reveals hints, advances pixel stages, and allows reshuffles without daily limits', async () => {
  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })
  const hint = await service.revealHint(started.state.session.id)
  expect(hint.action).toBe('updated')
  expect(hint.state.session.blurStage).toBe(1)
  const unblur = await service.unblur(started.state.session.id)
  expect(unblur.state.session.blurStage).toBe(2)
  await expect(service.giveUp(started.state.session.id, 'user-2')).rejects.toMatchObject({
    code: 'forbidden'
  })
  const gaveUp = await service.giveUp(started.state.session.id, 'user-1')
  const gaveUpContent = buildJumblePayload(gaveUp.state, {
    action: gaveUp.action,
    componentIds: componentIds(gaveUp.state.session.id)
  }).content
  expect(gaveUpContent).toContain('🏳️ <@user-1> gave up.')
  expect(gaveUpContent).toContain(`Unscramble: **${gaveUp.state.session.metadata.shuffledAnswer}**`)
  expect(gaveUpContent).not.toContain('Game over')
  expect(gaveUpContent).toContain('**Hints**')
  expect(gaveUpContent).toContain('• A hint')

  const second = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })
  expect(second.action).toBe('started')
})

test('continuous sessions follow each winner Last.fm profile until cancelled', async () => {
  await service.setProfile('winner-1', 'first-winner')
  await service.setProfile('winner-2', 'second-winner')
  const first = await service.start({
    starterUserId: 'starter',
    guildId: 'guild-1',
    channelId: 'channel-1',
    kind: 'track',
    username: 'original-profile'
  })
  await service.submitGuess(first.state.session.id, 'winner-1', 'Jóga')

  const second = await service.startContinuousSession(first.state.session.id)
  expect(second.state.session).toMatchObject({
    sourceUsername: 'first-winner',
    starterUserId: 'winner-1'
  })
  expect(second.state.session.metadata.continuousSession).toBeDefined()
  await expect(service.giveUp(second.state.session.id, 'winner-1')).rejects.toMatchObject({
    code: 'not-supported'
  })

  await service.submitGuess(second.state.session.id, 'winner-2', 'Jóga')
  const third = await service.continueContinuousSession(second.state.session.id)
  expect(third?.state.session).toMatchObject({
    sourceUsername: 'second-winner',
    starterUserId: 'winner-2'
  })
  expect(third?.state.session.metadata.continuousSession).toEqual(
    second.state.session.metadata.continuousSession
  )
  if (third === null) throw new Error('Expected the continuous session to start another game.')

  const cancelled = await service.cancelContinuousSession(third.state.session.id)
  expect(cancelled).toMatchObject({
    action: 'cancelled',
    state: { session: { outcome: 'cancelled' } }
  })
  await expect(service.activeForChannel('channel-1')).resolves.toBeNull()
})

test('continuous sessions require the winner to have a saved Last.fm profile', async () => {
  const first = await service.start({
    starterUserId: 'starter',
    guildId: 'guild-1',
    channelId: 'channel-1',
    kind: 'album',
    username: 'original-profile'
  })
  await service.submitGuess(first.state.session.id, 'profileless-winner', 'Homogenic')

  await expect(service.startContinuousSession(first.state.session.id)).rejects.toMatchObject({
    code: 'profile-missing'
  })
})

test('hydrates candidates before artwork checks and persists accepted aliases', async () => {
  service.stop()
  let hydrations = 0
  service = new JumbleService(
    repository,
    {
      async getCandidates() {
        return [
          {
            kind: 'track',
            answer: '))))',
            albumName: '(((((ultraSOUND)))))',
            artistName: 'The Neighbourhood'
          }
        ] satisfies readonly JumbleCandidate[]
      },
      async hydrate(candidate) {
        hydrations += 1
        return {
          ...candidate,
          imageUrl: 'https://example.test/ultrasound.png',
          answerVariants: [{ value: 'ultrasound', source: 'discogs' }]
        }
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: () => 0 }
  )

  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'track',
    username: 'tasky'
  })

  expect(hydrations).toBe(1)
  expect(started.state.session.metadata.answerVariants).toEqual([
    { value: 'ultrasound', source: 'discogs' }
  ])
  await expect(
    service.submitGuess(started.state.session.id, 'user-2', 'UltraSound')
  ).resolves.toMatchObject({ action: 'won' })
})

test('prefers an existing playable candidate before hydrating image-less candidates', async () => {
  service.stop()
  const hydratedAnswers: string[] = []
  const timing: JumbleTimingEvent[] = []
  service = new JumbleService(
    repository,
    {
      async getCandidates() {
        return [
          {
            kind: 'album',
            answer: 'Missing Artwork',
            artistName: 'Slow Artist'
          },
          {
            kind: 'album',
            answer: 'Ready Album',
            artistName: 'Fast Artist',
            imageUrl: 'https://example.test/ready.png'
          }
        ] satisfies readonly JumbleCandidate[]
      },
      async hydrate(candidate) {
        hydratedAnswers.push(candidate.answer)
        return candidate
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: () => 0, onTiming: (event) => timing.push(event) }
  )

  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })

  expect(started.state.session.answer).toBe('Ready Album')
  expect(hydratedAnswers).toEqual(['Ready Album'])
  expect(timing).toContainEqual(
    expect.objectContaining({ type: 'selection', outcome: 'success', attempts: 1 })
  )
})

test('returns a playable foreground candidate before deferred enrichment finishes', async () => {
  service.stop()
  let finishEnrichment!: () => void
  const enrichmentBlocked = new Promise<void>((resolve) => {
    finishEnrichment = resolve
  })
  service = new JumbleService(
    repository,
    {
      async getCandidates() {
        return [
          {
            kind: 'album',
            answer: 'Foreground Album',
            artistName: 'Foreground Artist',
            imageUrl: 'https://example.test/foreground.png'
          }
        ] satisfies readonly JumbleCandidate[]
      },
      async hydrateForStart(candidate) {
        return {
          status: 'deferred' as const,
          candidate,
          completion: enrichmentBlocked.then(() =>
            match(candidate)
              .returnType<JumbleCandidate>()
              .with({ kind: 'album' }, (album) => ({
                ...album,
                releaseDate: '2026-08-06'
              }))
              .with({ kind: 'artist' }, (artist) => artist)
              .with({ kind: 'track' }, (track) => track)
              .exhaustive()
          )
        }
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: () => 0 }
  )

  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })
  expect(started.state.session.metadata.candidate.releaseDate).toBeUndefined()

  let drained = false
  const drain = service.drain().then(() => {
    drained = true
  })
  await Promise.resolve()
  expect(drained).toBe(false)

  finishEnrichment()
  await drain
  expect(drained).toBe(true)
})

test('bounds failed candidate hydration attempts', async () => {
  service.stop()
  let hydrations = 0
  const timing: JumbleTimingEvent[] = []
  service = new JumbleService(
    repository,
    {
      async getCandidates() {
        return Array.from({ length: 32 }, (_, index) => ({
          kind: 'track' as const,
          answer: `Track ${index}`,
          artistName: 'Artist'
        }))
      },
      async hydrate(candidate) {
        hydrations += 1
        return candidate
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: () => 0, onTiming: (event) => timing.push(event) }
  )

  await expect(
    service.start({
      starterUserId: 'user-1',
      guildId: null,
      channelId: 'channel-1',
      kind: 'track',
      username: 'tasky'
    })
  ).rejects.toMatchObject({ code: 'no-candidates' })
  expect(hydrations).toBe(8)
  expect(timing).toEqual([
    expect.objectContaining({
      type: 'selection',
      kind: 'track',
      outcome: 'failed',
      candidateCount: 32,
      attempts: 8
    }),
    expect.objectContaining({
      type: 'start',
      kind: 'track',
      outcome: 'failed',
      imageCount: 0,
      hintCount: 0
    })
  ])
})

test('selects from a six-hundred-item candidate window', async () => {
  service.stop()
  let requestedLimit: number | undefined
  service = new JumbleService(
    repository,
    {
      async getCandidates(_kind, _username, limit) {
        requestedLimit = limit
        return Array.from({ length: 600 }, (_, index) => ({
          kind: 'track' as const,
          answer: `Track ${index}`,
          artistName: `Artist ${index}`,
          imageUrl: `https://example.test/track-${index}.png`
        }))
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: (maxExclusive) => maxExclusive - 1 }
  )

  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'track',
    username: 'tasky'
  })

  expect(requestedLimit).toBe(600)
  expect(started.state.session.answer).toBe('Track 599')
})

test('falls back to the oldest half instead of immediately repeating a recent candidate', async () => {
  service.stop()
  service = new JumbleService(
    repository,
    {
      async getCandidates() {
        return [
          {
            kind: 'track',
            answer: 'First Track',
            artistName: 'First Artist',
            imageUrl: 'https://example.test/first.png'
          },
          {
            kind: 'track',
            answer: 'Second Track',
            artistName: 'Second Artist',
            imageUrl: 'https://example.test/second.png'
          }
        ] satisfies readonly JumbleCandidate[]
      },
      async getHints() {
        return []
      }
    },
    { now: () => now, randomIndex: () => 0 }
  )

  const first = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'track',
    username: 'tasky'
  })
  expect(first.state.session.answer).toBe('First Track')
  await service.giveUp(first.state.session.id, 'user-1')

  const second = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'track',
    username: 'tasky'
  })
  expect(second.state.session.answer).toBe('Second Track')
  await service.giveUp(second.state.session.id, 'user-1')

  const third = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'track',
    username: 'tasky'
  })
  expect(third.state.session.answer).toBe('First Track')
})

test('expires an active session when its clock passes the kind timeout', async () => {
  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'artist',
    username: 'tasky'
  })
  now += 25_001
  await expect(service.activeForChannel('channel-1')).resolves.toBeNull()
  await expect(repository.findSession(started.state.session.id)).resolves.toMatchObject({
    outcome: 'expired'
  })
})

test('falls back to row fields when persisted session metadata is malformed', async () => {
  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })
  await database.db
    .update(jumbleSessions)
    .set({ metadata: '{"candidate":null,"hints":"invalid"}' })
    .where(eq(jumbleSessions.id, started.state.session.id))

  const restored = await repository.findSession(started.state.session.id)
  expect(restored?.metadata).toEqual({
    candidate: {
      albumName: 'Homogenic',
      answer: 'Homogenic',
      artistName: 'Björk',
      imageUrl: 'https://example.test/cover.png',
      kind: 'album'
    },
    hints: []
  })
})

test('strips candidate fields that do not belong to the persisted Jumble kind', async () => {
  const started = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'artist',
    username: 'tasky'
  })
  await database.db
    .update(jumbleSessions)
    .set({
      metadata: JSON.stringify({
        candidate: {
          kind: 'artist',
          answer: 'Björk',
          artistName: 'invalid duplicate artist',
          albumName: 'invalid album',
          durationMs: 123,
          countryCode: 'IS'
        },
        hints: []
      })
    })
    .where(eq(jumbleSessions.id, started.state.session.id))

  const restored = await repository.findSession(started.state.session.id)

  expect(restored?.metadata.candidate).toEqual({
    kind: 'artist',
    answer: 'Björk',
    countryCode: 'IS'
  })
})

test('creates parent directories for a local libSQL database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kanikou-jumble-db-'))
  const path = join(root, 'nested', 'jumble.db')
  const local = createKanikouDatabase({ url: `file:${path}` })
  try {
    await local.initialize()
    expect((await stat(path)).isFile()).toBe(true)
  } finally {
    local.close()
    await rm(root, { force: true, recursive: true })
  }
})
