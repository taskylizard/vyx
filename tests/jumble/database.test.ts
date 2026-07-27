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
  expect(
    buildJumblePayload(solved.state, {
      action: solved.action,
      componentIds: componentIds(solved.state.session.id)
    }).content
  ).toContain('Solved in **1.3s**.')
  await expect(service.stats('user-1')).resolves.toMatchObject({ played: 1, won: 0 })
  await expect(service.stats('user-2')).resolves.toMatchObject({ played: 1, won: 1 })
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
  await service.giveUp(started.state.session.id, 'user-1')

  const second = await service.start({
    starterUserId: 'user-1',
    guildId: null,
    channelId: 'channel-1',
    kind: 'album',
    username: 'tasky'
  })
  expect(second.action).toBe('started')
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

test('bounds failed candidate hydration attempts', async () => {
  service.stop()
  let hydrations = 0
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
    { now: () => now, randomIndex: () => 0 }
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
