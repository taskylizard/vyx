import { randomInt, randomUUID } from 'node:crypto'
import { match, P } from 'ts-pattern'
import { answerMatchesAny, normalizeAnswer, shuffleCharacters } from './answer.ts'
import { getCandidateImageUrls, jumbleCandidateIdentityKey } from './candidate.ts'
import { PIXELATION_LEVELS } from './renderer.ts'
import { JumbleRepository } from './repository.ts'
import type {
  JumbleActionResult,
  JumbleActivityState,
  JumbleCandidate,
  JumbleErrorCode,
  JumbleHint,
  JumbleKind,
  JumbleSession,
  JumbleServiceOptions,
  JumbleState,
  JumbleStats,
  StartJumbleInput
} from './types.ts'
import { LastFmError, type JumbleMusicProvider } from './lastfm.ts'
import { emitJumbleTiming, jumbleDurationMs, type JumbleTimingSink } from './timing.ts'

export type {
  JumbleAction,
  JumbleActionResult,
  JumbleErrorCode,
  JumbleServiceOptions,
  JumbleState,
  StartJumbleInput
} from './types.ts'

export const JUMBLE_TIMEOUT_MS: Readonly<Record<JumbleKind, number>> = {
  artist: 25_000,
  album: 40_000,
  track: 40_000
}

const MAX_CANDIDATE_HYDRATION_ATTEMPTS = 8
const JUMBLE_CANDIDATE_LIMIT = 600
const JUMBLE_RECENT_CANDIDATE_LIMIT = 500

export class JumbleError extends Error {
  readonly code: JumbleErrorCode

  constructor(message: string, code: JumbleErrorCode = 'not-found') {
    super(message)
    this.name = 'JumbleError'
    this.code = code
  }
}

type HydratableProvider = JumbleMusicProvider & {
  hydrate?(candidate: JumbleCandidate): Promise<JumbleCandidate>
}

/** Coordinates selection, answer checking, persistence, and expiry. */
export class JumbleService {
  private readonly repository: JumbleRepository
  private readonly provider: HydratableProvider
  private readonly now: () => number
  private readonly randomIndex: (maxExclusive: number) => number
  private readonly onExpired?: (state: JumbleState) => void | Promise<void>
  private readonly onTiming?: JumbleTimingSink
  private readonly startingChannels = new Set<string>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    repository: JumbleRepository,
    provider: HydratableProvider,
    options: JumbleServiceOptions = {}
  ) {
    this.repository = repository
    this.provider = provider
    this.now = options.now ?? Date.now
    this.randomIndex = options.randomIndex ?? ((maxExclusive) => randomInt(maxExclusive))
    this.onExpired = options.onExpired
    this.onTiming = options.onTiming
  }

  async setProfile(discordUserId: string, username: string): Promise<string> {
    let normalized = username.trim().replace(/^@/u, '').slice(0, 64)
    if (normalized.length < 1) throw new JumbleError('Enter a Last.fm username.', 'profile-missing')
    if (this.provider.validateUsername !== undefined) {
      normalized = (await this.provider.validateUsername(normalized)).trim().slice(0, 64)
    }
    if (normalized.length < 1)
      throw new JumbleError('Last.fm returned an invalid username.', 'profile-missing')
    await this.repository.setProfile(discordUserId, normalized)
    return normalized
  }

  async getProfile(discordUserId: string): Promise<string | null> {
    return this.repository.getProfile(discordUserId)
  }

  async start(input: StartJumbleInput): Promise<JumbleActionResult<'started'>> {
    if (this.startingChannels.has(input.channelId))
      throw new JumbleError('A Jumble is already starting in this channel.', 'busy')
    this.startingChannels.add(input.channelId)
    const startedAt = performance.now()
    let setupMs = 0
    let selectionMs = 0
    let hintsMs = 0
    let persistenceMs = 0
    let hintCount = 0
    let imageCount = 0
    let outcome: 'success' | 'failed' = 'failed'
    try {
      const setupStartedAt = performance.now()
      let username: string
      try {
        await this.clearActiveChannel(input.channelId)
        username = await this.resolveStartUsername(input)
      } finally {
        setupMs = jumbleDurationMs(setupStartedAt)
      }

      const selectionStartedAt = performance.now()
      let candidate: JumbleCandidate
      try {
        candidate = await this.selectPlayableCandidate(input.kind, input.starterUserId, username)
      } finally {
        selectionMs = jumbleDurationMs(selectionStartedAt)
      }
      const imageUrls = getCandidateImageUrls(candidate)
      imageCount = imageUrls.length

      const hintsStartedAt = performance.now()
      let hints: JumbleHint[]
      try {
        hints = shuffle([...(await this.provider.getHints(candidate))], this.randomIndex)
        hintCount = hints.length
      } finally {
        hintsMs = jumbleDurationMs(hintsStartedAt)
      }
      const shuffledAnswer = shuffleJumbleAnswer(candidate.answer, this.randomIndex)
      const id = randomUUID()
      const persistenceStartedAt = performance.now()
      let complete: JumbleState
      try {
        const state = await this.repository.createSession({
          id,
          starterUserId: input.starterUserId,
          guildId: input.guildId,
          channelId: input.channelId,
          kind: input.kind,
          sourceUsername: username,
          answer: candidate.answer,
          artistName: candidate.artistName ?? null,
          albumName:
            candidate.albumName ??
            match(input.kind)
              .with('album', () => candidate.answer)
              .with('artist', 'track', () => null)
              .exhaustive(),
          imageUrl: imageUrls[0] ?? null,
          metadata: {
            candidate,
            shuffledAnswer,
            answerVariants: candidate.answerVariants,
            hints,
            continuousSession: input.continuousSession
          },
          startedAt: this.now(),
          blurStage: 0
        })
        await this.repository.addHints(id, hints, Math.min(3, hints.length))
        complete = await this.getState(state.id)
      } finally {
        persistenceMs = jumbleDurationMs(persistenceStartedAt)
      }
      this.scheduleExpiry(complete.session)
      outcome = 'success'
      return { action: 'started', state: complete }
    } catch (error) {
      this.rethrowStartError(error)
    } finally {
      emitJumbleTiming(this.onTiming, {
        type: 'start',
        kind: input.kind,
        outcome,
        durationMs: jumbleDurationMs(startedAt),
        setupMs,
        selectionMs,
        hintsMs,
        persistenceMs,
        hintCount,
        imageCount
      })
      this.startingChannels.delete(input.channelId)
    }
  }

  async getState(sessionId: string): Promise<JumbleState> {
    const session = await this.repository.findSession(sessionId)
    if (session === null) throw new JumbleError('That Jumble no longer exists.', 'not-found')
    let hints = await this.repository.listHints(sessionId)
    if (hints.length === 0) {
      hints = session.metadata.hints.map((hint, order) => ({ ...hint, shown: order < 3, order }))
    }
    return { session, hints }
  }

  async activeForChannel(channelId: string): Promise<JumbleState | null> {
    const session = await this.repository.findActiveForChannel(channelId)
    if (session === null) return null
    if (this.isExpired(session)) {
      await this.expire(session.id)
      return null
    }
    return this.getState(session.id)
  }

  async attachMessage(sessionId: string, messageId: string): Promise<JumbleState> {
    const session = await this.repository.setMessageId(sessionId, messageId)
    if (session === null) throw new JumbleError('That Jumble no longer exists.', 'not-found')
    this.scheduleExpiry(session)
    return this.getState(sessionId)
  }

  async revealHint(sessionId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    const hint = await this.repository.revealNextHint(sessionId)
    if (hint !== null) {
      const session = live.state.session
      if (session.imageUrl !== null && session.blurStage < PIXELATION_LEVELS.length - 1) {
        await this.repository.setBlurStage(sessionId, session.blurStage + 1)
      }
    }
    return {
      action: hint === null ? 'unchanged' : 'updated',
      state: await this.getState(sessionId)
    }
  }

  async unblur(sessionId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    const session = live.state.session
    if (session.imageUrl === null)
      throw new JumbleError('This Jumble does not use pixelation.', 'not-supported')
    if (live.state.hints.some((hint) => !hint.shown))
      return { action: 'unchanged', state: live.state }
    const nextStage = Math.min(session.blurStage + 1, PIXELATION_LEVELS.length - 1)
    if (nextStage === session.blurStage) return { action: 'unchanged', state: live.state }
    await this.repository.setBlurStage(sessionId, nextStage)
    return { action: 'updated', state: await this.getState(sessionId) }
  }

  async reshuffle(sessionId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    const session = live.state.session
    const shuffledAnswer = shuffleJumbleAnswer(session.answer, this.randomIndex)
    await this.repository.updateMetadata(sessionId, {
      ...session.metadata,
      shuffledAnswer
    })
    await this.repository.incrementReshuffle(sessionId)
    return { action: 'updated', state: await this.getState(sessionId) }
  }

  async submitGuess(
    sessionId: string,
    discordUserId: string,
    rawAnswer: string
  ): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    const normalizedAnswer = normalizeAnswer(rawAnswer)
    const answerVariants =
      live.state.session.metadata.answerVariants ??
      live.state.session.metadata.candidate.answerVariants ??
      []
    const correct = answerMatchesAny([live.state.session.answer, ...answerVariants], rawAnswer)
    await this.repository.recordAnswer({
      sessionId,
      discordUserId,
      rawAnswer,
      normalizedAnswer,
      correct,
      answeredAt: this.now()
    })
    if (!correct) return { action: 'incorrect', state: await this.getState(sessionId) }
    const ended = await this.repository.endSession(sessionId, 'won', this.now())
    this.cancelExpiry(sessionId)
    return { action: 'won', state: await this.getState(ended?.id ?? sessionId) }
  }

  async startContinuousSession(completedSessionId: string): Promise<JumbleActionResult<'started'>> {
    const completed = await this.getState(completedSessionId)
    return match({
      continuousSession: completed.session.metadata.continuousSession,
      endedAt: completed.session.endedAt,
      outcome: completed.session.outcome
    })
      .with({ continuousSession: undefined, endedAt: P.nonNullable, outcome: 'won' }, () =>
        this.startNextContinuousGame(completed, { id: randomUUID() })
      )
      .otherwise(() => {
        throw new JumbleError('Start a session from a solved standalone Jumble.', 'not-supported')
      })
  }

  async continueContinuousSession(
    completedSessionId: string
  ): Promise<JumbleActionResult<'started'> | null> {
    const completed = await this.getState(completedSessionId)
    return match({
      continuousSession: completed.session.metadata.continuousSession,
      outcome: completed.session.outcome
    })
      .with({ continuousSession: P.nonNullable, outcome: 'won' }, ({ continuousSession }) =>
        this.startNextContinuousGame(completed, continuousSession)
      )
      .otherwise(() => null)
  }

  async cancelContinuousSession(sessionId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    if (live.state.session.metadata.continuousSession === undefined) {
      throw new JumbleError('There is no active Jumble session to cancel.', 'not-supported')
    }

    await this.repository.endSession(sessionId, 'cancelled', this.now())
    this.cancelExpiry(sessionId)
    return { action: 'cancelled', state: await this.getState(sessionId) }
  }

  async giveUp(sessionId: string, requesterUserId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    const completed = completedAction(live)
    if (completed !== undefined) return completed
    if (live.state.session.metadata.continuousSession !== undefined) {
      throw new JumbleError('Say "cancel" to stop this Jumble session.', 'not-supported')
    }
    if (live.state.session.starterUserId !== requesterUserId) {
      throw new JumbleError('Only the person who started this Jumble can give up.', 'forbidden')
    }
    await this.repository.endSession(sessionId, 'gave_up', this.now())
    this.cancelExpiry(sessionId)
    return { action: 'gave_up', state: await this.getState(sessionId) }
  }

  async expire(sessionId: string): Promise<JumbleActionResult | null> {
    const session = await this.repository.findSession(sessionId)
    if (session === null || session.endedAt !== null) return null
    const ended = await this.repository.endSession(sessionId, 'expired', this.now())
    this.cancelExpiry(sessionId)
    if (ended === null) return null
    const state = await this.getState(sessionId)
    await this.notifyExpired(ended)
    return { action: 'expired', state }
  }

  async restoreActive(): Promise<void> {
    const sessions = await this.repository.listActive()
    await Promise.all(
      sessions.map(async (session) => {
        if (this.isExpired(session)) {
          await this.expire(session.id)
        } else {
          this.scheduleExpiry(session)
        }
      })
    )
  }

  async stats(discordUserId: string, kind?: JumbleKind): Promise<JumbleStats> {
    return this.repository.statsForUser(discordUserId, kind)
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private async ensureActive(sessionId: string): Promise<JumbleActivityState> {
    const state = await this.getState(sessionId)
    if (state.session.endedAt !== null) {
      return { status: 'ended', action: state.session.outcome ?? 'unchanged', state }
    }
    if (!this.isExpired(state.session)) return { status: 'active', state }
    const ended = await this.repository.endSession(sessionId, 'expired', this.now())
    this.cancelExpiry(sessionId)
    if (ended !== null) await this.notifyExpired(ended)
    return { status: 'ended', action: 'expired', state: await this.getState(sessionId) }
  }

  private async clearActiveChannel(channelId: string): Promise<void> {
    const active = await this.repository.findActiveForChannel(channelId)
    if (active === null) return
    if (this.isExpired(active)) {
      const ended = await this.repository.endSession(active.id, 'expired', this.now())
      this.cancelExpiry(active.id)
      if (ended !== null) await this.notifyExpired(ended)
    } else {
      throw new JumbleError('There is already a Jumble running in this channel.', 'busy')
    }
  }

  private async resolveStartUsername(input: StartJumbleInput): Promise<string> {
    const username = (
      input.username ?? (await this.repository.getProfile(input.starterUserId))
    )?.trim()
    if (username === undefined || username.length === 0) {
      throw new JumbleError(
        'Set your Last.fm username with `/jumble profile` or pass one to this command.',
        'profile-missing'
      )
    }
    return username
  }

  private async startNextContinuousGame(
    completed: JumbleState,
    continuousSession: NonNullable<JumbleSession['metadata']['continuousSession']>
  ): Promise<JumbleActionResult<'started'>> {
    const winnerUserId = await this.repository.winningUserId(completed.session.id)
    if (winnerUserId === null) {
      throw new JumbleError('The winner could not be determined for that Jumble.', 'not-found')
    }
    const username = await this.repository.getProfile(winnerUserId)
    if (username === null || username.trim().length === 0) {
      throw new JumbleError(
        'The winner needs to save a Last.fm username with `/jumble profile` before the session can continue.',
        'profile-missing'
      )
    }

    return this.start({
      starterUserId: winnerUserId,
      guildId: completed.session.guildId,
      channelId: completed.session.channelId,
      kind: completed.session.kind,
      username,
      continuousSession
    })
  }

  private async selectPlayableCandidate(
    kind: JumbleKind,
    starterUserId: string,
    username: string
  ): Promise<JumbleCandidate> {
    const startedAt = performance.now()
    let candidateFetchMs = 0
    let recentLookupMs = 0
    let hydrationMs = 0
    let candidateCount = 0
    let attemptedCount = 0
    let outcome: 'success' | 'failed' = 'failed'
    try {
      const candidateFetchStartedAt = performance.now()
      let candidates: JumbleCandidate[]
      try {
        candidates = [
          ...(await this.provider.getCandidates(kind, username, JUMBLE_CANDIDATE_LIMIT))
        ].filter((candidate) => isCandidateIdentityValid(candidate, kind))
      } finally {
        candidateFetchMs = jumbleDurationMs(candidateFetchStartedAt)
      }
      candidateCount = candidates.length
      if (candidates.length === 0)
        throw new JumbleError('No playable music was found for that profile.', 'no-candidates')

      const recentLookupStartedAt = performance.now()
      let recent: readonly JumbleSession[]
      try {
        recent = await this.repository.listRecentForUser(
          starterUserId,
          kind,
          JUMBLE_RECENT_CANDIDATE_LIMIT
        )
      } finally {
        recentLookupMs = jumbleDurationMs(recentLookupStartedAt)
      }
      const pool = buildCandidatePool(candidates, recent)
      const startIndex = this.randomIndex(pool.length)
      const attempts = Math.min(MAX_CANDIDATE_HYDRATION_ATTEMPTS, pool.length)
      let selected: JumbleCandidate | undefined

      for (let offset = 0; offset < attempts; offset += 1) {
        attemptedCount += 1
        const original = pool[(startIndex + offset) % pool.length]!
        let hydrated = original
        const hydrationStartedAt = performance.now()
        try {
          if (this.provider.hydrate !== undefined) {
            try {
              // eslint-disable-next-line no-await-in-loop -- tasky: sequential hydration, tries candidates one at a time until a playable one is found
              hydrated = await this.provider.hydrate(original)
            } catch {
              // tasky: one broken provider lookup should not brick the whole profile
            }
          }
        } finally {
          hydrationMs += jumbleDurationMs(hydrationStartedAt)
        }
        if (isPlayableCandidate(hydrated, kind)) {
          selected = hydrated
          break
        }
      }

      if (selected === undefined)
        throw new JumbleError('No playable music was found for that profile.', 'no-candidates')
      outcome = 'success'
      return selected
    } finally {
      emitJumbleTiming(this.onTiming, {
        type: 'selection',
        kind,
        outcome,
        durationMs: jumbleDurationMs(startedAt),
        candidateFetchMs,
        recentLookupMs,
        hydrationMs,
        candidateCount,
        attempts: attemptedCount
      })
    }
  }

  private rethrowStartError(error: unknown): never {
    if (error instanceof LastFmError) {
      const code = match(error.code)
        .returnType<JumbleError['code']>()
        .with('invalid-username', () => 'profile-missing')
        .with('empty-results', () => 'no-candidates')
        .otherwise(() => 'configuration')
      throw new JumbleError(error.message, code)
    }
    if (
      error instanceof Error &&
      error.message.includes('jumble_sessions_one_active_channel_idx')
    ) {
      throw new JumbleError('There is already a Jumble running in this channel.', 'busy')
    }
    throw error
  }

  private isExpired(session: JumbleSession): boolean {
    return this.now() - session.startedAt >= JUMBLE_TIMEOUT_MS[session.kind]
  }

  private scheduleExpiry(session: JumbleSession): void {
    if (session.endedAt !== null) return
    this.cancelExpiry(session.id)
    const delay = Math.max(1, session.startedAt + JUMBLE_TIMEOUT_MS[session.kind] - this.now())
    const timer = setTimeout(() => {
      void this.expire(session.id).catch(() => undefined)
    }, delay)
    this.timers.set(session.id, timer)
  }

  private cancelExpiry(sessionId: string): void {
    const timer = this.timers.get(sessionId)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(sessionId)
  }

  private async notifyExpired(session: JumbleSession): Promise<void> {
    if (this.onExpired === undefined) return
    try {
      await this.onExpired(await this.getState(session.id))
    } catch {
      // tasky: expiry owns session state, failed ui updates cannot resurrect it
    }
  }
}

function completedAction(activity: JumbleActivityState): JumbleActionResult | undefined {
  return match(activity)
    .returnType<JumbleActionResult | undefined>()
    .with({ status: 'active' }, () => undefined)
    .with({ status: 'ended' }, ({ action, state }) => ({ action, state }))
    .exhaustive()
}

function isCandidateIdentityValid(candidate: JumbleCandidate, kind: JumbleKind): boolean {
  if (
    candidate.kind !== kind ||
    candidate.answer.trim().length < 2 ||
    candidate.answer.length > 120
  )
    return false
  return true
}

function isPlayableCandidate(candidate: JumbleCandidate, kind: JumbleKind): boolean {
  if (!isCandidateIdentityValid(candidate, kind)) return false
  const hasSemanticAnswer =
    normalizeAnswer(candidate.answer).length > 0 ||
    (candidate.answerVariants ?? []).some((variant) => normalizeAnswer(variant.value).length > 0)
  return hasSemanticAnswer && getCandidateImageUrls(candidate).length > 0
}

function buildCandidatePool(
  candidates: JumbleCandidate[],
  recent: readonly JumbleSession[]
): JumbleCandidate[] {
  const recentRanks = new Map<string, number>()
  for (const [index, session] of recent.entries()) {
    const key = jumbleCandidateIdentityKey(session)
    if (!recentRanks.has(key)) recentRanks.set(key, index)
  }
  const unseen = candidates.filter(
    (candidate) => !recentRanks.has(jumbleCandidateIdentityKey(candidate))
  )
  if (unseen.length > 0) return unseen

  const cooldownRank = Math.max(1, Math.ceil(Math.min(recentRanks.size, candidates.length) / 2))
  const cooled = candidates.filter((candidate) => {
    const rank = recentRanks.get(jumbleCandidateIdentityKey(candidate))
    return rank === undefined || rank >= cooldownRank
  })
  return cooled.length > 0 ? cooled : candidates
}

function shuffle<T>(items: T[], randomIndex: (maxExclusive: number) => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    ;[items[index], items[swapIndex]] = [items[swapIndex]!, items[index]!]
  }
  return items
}

function shuffleJumbleAnswer(value: string, randomIndex: (maxExclusive: number) => number): string {
  const shuffled = shuffleCharacters(value, randomIndex)
  if (shuffled !== value) return shuffled.toUpperCase()

  const letters = Array.from(value)
  const first = letters.findIndex((letter) => !/\s/u.test(letter))
  if (first < 0) return value.toUpperCase()
  const second = letters.findIndex(
    (letter, index) => index > first && !/\s/u.test(letter) && letter !== letters[first]
  )
  if (second < 0) return value.toUpperCase()
  ;[letters[first], letters[second]] = [letters[second]!, letters[first]!]
  return letters.join('').toUpperCase()
}
