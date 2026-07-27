import { randomInt, randomUUID } from 'node:crypto'
import { match } from 'ts-pattern'
import { answerMatchesAny, normalizeAnswer, shuffleCharacters } from './answer.ts'
import { getCandidateImageUrls } from './candidate.ts'
import { PIXELATION_LEVELS } from './renderer.ts'
import { JumbleRepository } from './repository.ts'
import type {
  JumbleAction,
  JumbleActionResult,
  JumbleCandidate,
  JumbleKind,
  JumbleSession,
  JumbleServiceOptions,
  JumbleState,
  JumbleStats,
  StartJumbleInput
} from './types.ts'
import { LastFmError, type JumbleMusicProvider } from './lastfm.ts'

export type {
  JumbleAction,
  JumbleActionResult,
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

export class JumbleError extends Error {
  readonly code:
    | 'busy'
    | 'profile-missing'
    | 'no-candidates'
    | 'invalid-candidate'
    | 'not-found'
    | 'not-supported'
    | 'forbidden'
    | 'configuration'

  constructor(
    message: string,
    code:
      | 'busy'
      | 'profile-missing'
      | 'no-candidates'
      | 'invalid-candidate'
      | 'not-found'
      | 'not-supported'
      | 'forbidden'
      | 'configuration' = 'not-found'
  ) {
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

  async start(input: StartJumbleInput): Promise<JumbleActionResult> {
    if (this.startingChannels.has(input.channelId))
      throw new JumbleError('A Jumble is already starting in this channel.', 'busy')
    this.startingChannels.add(input.channelId)
    try {
      await this.clearActiveChannel(input.channelId)
      const username = await this.resolveStartUsername(input)
      const candidate = await this.selectPlayableCandidate(
        input.kind,
        input.starterUserId,
        username
      )
      const imageUrls = getCandidateImageUrls(candidate)

      const hints = shuffle([...(await this.provider.getHints(candidate))], this.randomIndex)
      const shuffledAnswer = shuffleJumbleAnswer(candidate.answer, this.randomIndex)
      const id = randomUUID()
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
          hints
        },
        startedAt: this.now(),
        blurStage: 0
      })
      await this.repository.addHints(id, hints, Math.min(3, hints.length))
      const complete = await this.getState(state.id)
      this.scheduleExpiry(complete.session)
      return { action: 'started', state: complete }
    } catch (error) {
      this.rethrowStartError(error)
    } finally {
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
    if (live.action !== undefined) return { action: live.action, state: live.state }
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
    if (live.action !== undefined) return { action: live.action, state: live.state }
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
    if (live.action !== undefined) return { action: live.action, state: live.state }
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
    if (live.action !== undefined) return { action: live.action, state: live.state }
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

  async giveUp(sessionId: string, requesterUserId: string): Promise<JumbleActionResult> {
    const live = await this.ensureActive(sessionId)
    if (live.action !== undefined) return { action: live.action, state: live.state }
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

  private async ensureActive(
    sessionId: string
  ): Promise<{ state: JumbleState; action?: JumbleAction }> {
    const state = await this.getState(sessionId)
    if (state.session.endedAt !== null) {
      return { state, action: state.session.outcome ?? 'unchanged' }
    }
    if (!this.isExpired(state.session)) return { state }
    const ended = await this.repository.endSession(sessionId, 'expired', this.now())
    this.cancelExpiry(sessionId)
    if (ended !== null) await this.notifyExpired(ended)
    return { state: await this.getState(sessionId), action: 'expired' }
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

  private async selectPlayableCandidate(
    kind: JumbleKind,
    starterUserId: string,
    username: string
  ): Promise<JumbleCandidate> {
    const candidates = [...(await this.provider.getCandidates(kind, username, 100))].filter(
      (candidate) => isCandidateIdentityValid(candidate, kind)
    )
    if (candidates.length === 0)
      throw new JumbleError('No playable music was found for that profile.', 'no-candidates')

    const recent = await this.repository.listRecentForUser(starterUserId, kind, 80)
    const recentKeys = new Set(
      recent.map((session) => candidateKey(session.answer, session.artistName))
    )
    const unseen = candidates.filter(
      (candidate) => !recentKeys.has(candidateKey(candidate.answer, candidate.artistName))
    )
    const pool = unseen.length > 0 ? unseen : candidates
    const startIndex = this.randomIndex(pool.length)
    const attempts = Math.min(MAX_CANDIDATE_HYDRATION_ATTEMPTS, pool.length)

    for (let offset = 0; offset < attempts; offset += 1) {
      const original = pool[(startIndex + offset) % pool.length]!
      let hydrated = original
      if (this.provider.hydrate !== undefined) {
        try {
          // eslint-disable-next-line no-await-in-loop -- tasky: sequential hydration, tries candidates one at a time until a playable one is found
          hydrated = await this.provider.hydrate(original)
        } catch {
          // tasky: one broken provider lookup must not make the whole profile unplayable.
        }
      }
      if (isPlayableCandidate(hydrated, kind)) return hydrated
    }
    throw new JumbleError('No playable music was found for that profile.', 'no-candidates')
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
      // tasky: expiry owns session state; a failed UI update must not resurrect the game.
    }
  }
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

function candidateKey(answer: string, artist: string | null | undefined): string {
  return `${normalizeAnswer(answer)}\u0000${normalizeAnswer(artist ?? '')}`
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
