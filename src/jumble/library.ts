import { randomInt, randomUUID } from 'node:crypto'
import { sleep } from 'radashi'
import { runDetached, traceBackgroundOperation } from '../observability/tracing.ts'
import {
  JUMBLE_KINDS,
  type JumbleCandidate,
  type JumbleKind,
  type JumbleTrackedCounts
} from './types.ts'
import type { JumbleMusicProvider } from './lastfm.ts'
import { JumbleLibraryRepository } from './library-repository.ts'
import type { JumbleRepository } from './repository.ts'
import { emitJumbleTiming, jumbleDurationMs, type JumbleTimingSink } from './timing.ts'

const MIN_FRESH_MS = 6 * 60 * 60 * 1_000
const MAX_FRESH_MS = 18 * 60 * 60 * 1_000
const LEASE_MS = 2 * 60 * 1_000
const SWEEP_MS = 15 * 60 * 1_000
const CONTENTION_WAIT_MS = 10_500
const CONTENTION_POLL_MS = 100

type LibraryRefreshResult =
  | { status: 'published'; candidates: readonly JumbleCandidate[] }
  | { status: 'contended' }

export class JumbleLibrary {
  private readonly persistence: JumbleLibraryRepository
  private readonly pending = new Map<string, Promise<LibraryRefreshResult>>()
  private readonly rememberWrites = new Set<Promise<void>>()
  private backgroundTail: Promise<void> = Promise.resolve()
  private activeSweep?: Promise<void>
  private sweepTimer?: ReturnType<typeof setTimeout>
  private stopped = false

  constructor(
    private readonly repository: JumbleRepository,
    private readonly provider: JumbleMusicProvider,
    private readonly options: {
      now?: () => number
      onTiming?: JumbleTimingSink
      freshMs?: number
      sweepMs?: number
      contentionWaitMs?: number
      contentionPollMs?: number
    } = {}
  ) {
    this.persistence = new JumbleLibraryRepository(repository.db)
  }

  async get(
    discordUserId: string,
    kind: JumbleKind,
    username: string
  ): Promise<readonly JumbleCandidate[]> {
    const startedAt = performance.now()
    const canonical = canonicalLastFmUsername(username)
    const snapshot = await this.persistence.read(discordUserId, kind, canonical)
    if (snapshot.candidates.length > 0) {
      const stale = (snapshot.refreshAfter ?? 0) <= this.now()
      if (stale && !this.stopped) {
        runDetached(() => {
          void traceBackgroundOperation(
            'jumble.library.refresh',
            { 'jumble.kind': kind, 'jumble.refresh.source': 'stale' },
            () => this.refresh(discordUserId, kind, canonical)
          ).catch(() => undefined)
        })
      }
      this.timing(kind, stale ? 'stale' : 'hit', 'success', startedAt, snapshot.candidates.length)
      return snapshot.candidates
    }
    try {
      const refreshed = await this.refresh(discordUserId, kind, canonical)
      if (refreshed.status === 'published') {
        const published = await this.persistence.read(discordUserId, kind, canonical)
        this.timing(kind, 'refreshed', 'success', startedAt, published.candidates.length)
        return published.candidates
      }
      const published = await this.waitForPublication(discordUserId, kind, canonical)
      if (published.length > 0) {
        this.timing(kind, 'refreshed', 'success', startedAt, published.length)
        return published
      }
      const retry = await this.refresh(discordUserId, kind, canonical)
      if (retry.status === 'published') {
        const retried = await this.persistence.read(discordUserId, kind, canonical)
        this.timing(kind, 'refreshed', 'success', startedAt, retried.candidates.length)
        return retried.candidates
      }
    } catch {}
    this.timing(kind, 'fallback', 'failed', startedAt, 0)
    return this.provider.getCandidates(kind, username, 600)
  }

  enqueueProfile(discordUserId: string, username: string): void {
    const canonical = canonicalLastFmUsername(username)
    this.backgroundTail = runDetached(() =>
      this.backgroundTail.then(async () => {
        for (const kind of JUMBLE_KINDS) {
          if (this.stopped) return
          // eslint-disable-next-line no-await-in-loop -- tasky: one background refresh at a time avoids slamming Last.fm after profile changes
          await traceBackgroundOperation(
            'jumble.library.refresh',
            { 'jumble.kind': kind, 'jumble.refresh.source': 'profile' },
            () => this.refresh(discordUserId, kind, canonical)
          ).catch(() => undefined)
        }
      })
    )
  }

  async trackedCounts(discordUserId: string, username: string): Promise<JumbleTrackedCounts> {
    const counts = await this.persistence.trackedCounts(
      discordUserId,
      canonicalLastFmUsername(username)
    )
    return {
      ...counts,
      all: JUMBLE_KINDS.reduce((total, kind) => total + counts[kind], 0)
    }
  }

  remember(
    discordUserId: string,
    kind: JumbleKind,
    username: string,
    candidate: JumbleCandidate
  ): void {
    if (this.stopped) return
    const work = runDetached(() =>
      this.persistence
        .updateCandidate(discordUserId, kind, canonicalLastFmUsername(username), candidate)
        .catch(() => undefined)
        .finally(() => this.rememberWrites.delete(work))
    )
    this.rememberWrites.add(work)
  }

  startSweep(): void {
    if (this.sweepTimer !== undefined || this.activeSweep !== undefined || this.stopped) return
    this.scheduleSweep(1)
  }

  stop(): void {
    this.stopped = true
    if (this.sweepTimer !== undefined) clearTimeout(this.sweepTimer)
    this.sweepTimer = undefined
  }

  async drain(): Promise<void> {
    while (
      this.pending.size > 0 ||
      this.rememberWrites.size > 0 ||
      this.activeSweep !== undefined
    ) {
      // eslint-disable-next-line no-await-in-loop -- tasky: new detached work can appear while the current shutdown batch settles
      await Promise.allSettled([
        ...this.pending.values(),
        ...this.rememberWrites,
        this.backgroundTail,
        ...(this.activeSweep === undefined ? [] : [this.activeSweep])
      ])
    }
    await this.backgroundTail
  }

  private refresh(
    discordUserId: string,
    kind: JumbleKind,
    username: string
  ): Promise<LibraryRefreshResult> {
    if (this.stopped) return Promise.resolve({ status: 'contended' })
    const key = `${discordUserId}\0${kind}\0${username}`
    const existing = this.pending.get(key)
    if (existing !== undefined) return existing
    const work = this.performRefresh(discordUserId, kind, username).finally(() =>
      this.pending.delete(key)
    )
    this.pending.set(key, work)
    return work
  }

  private async performRefresh(
    discordUserId: string,
    kind: JumbleKind,
    username: string
  ): Promise<LibraryRefreshResult> {
    const owner = randomUUID(),
      now = this.now()
    if (
      !(await this.persistence.acquireLease({
        discordUserId,
        kind,
        username,
        owner,
        now,
        leaseMs: LEASE_MS
      }))
    )
      return { status: 'contended' }
    try {
      const candidates = [...(await this.provider.getCandidates(kind, username, 600))]
      const published = await this.persistence.replace({
        discordUserId,
        kind,
        username,
        owner,
        version: randomUUID(),
        candidates,
        now,
        refreshAfter: now + this.nextFreshMs()
      })
      return published ? { status: 'published', candidates } : { status: 'contended' }
    } catch (error) {
      await this.persistence.fail(discordUserId, kind, owner, now)
      throw error
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }
  private nextFreshMs(): number {
    return this.options.freshMs ?? randomInt(MIN_FRESH_MS, MAX_FRESH_MS + 1)
  }
  private sweepMs(): number {
    return this.options.sweepMs ?? SWEEP_MS
  }

  private async waitForPublication(
    discordUserId: string,
    kind: JumbleKind,
    username: string
  ): Promise<readonly JumbleCandidate[]> {
    if (this.stopped) return []
    const deadline = performance.now() + (this.options.contentionWaitMs ?? CONTENTION_WAIT_MS)
    const pollMs = this.options.contentionPollMs ?? CONTENTION_POLL_MS
    while (performance.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- tasky: another process owns the refresh, poll the durable generation instead of duplicating provider work
      await sleep(pollMs)
      // eslint-disable-next-line no-await-in-loop -- tasky: each poll checks whether the lease owner atomically published its generation
      const snapshot = await this.persistence.read(discordUserId, kind, username)
      if (snapshot.candidates.length > 0) return snapshot.candidates
    }
    return []
  }

  private scheduleSweep(delay: number): void {
    this.sweepTimer = runDetached(() =>
      setTimeout(() => {
        runDetached(() => {
          this.sweepTimer = undefined
          const work = this.runSweep()
            .catch(() => undefined)
            .finally(() => {
              if (this.activeSweep === work) this.activeSweep = undefined
              if (!this.stopped) this.scheduleSweep(this.sweepMs())
            })
          this.activeSweep = work
        })
      }, delay)
    )
  }

  private async runSweep(): Promise<void> {
    for (const profile of await this.repository.listProfiles()) {
      if (this.stopped) return
      for (const kind of JUMBLE_KINDS) {
        const username = canonicalLastFmUsername(profile.username)
        // eslint-disable-next-line no-await-in-loop -- tasky: keep sweep provider pressure bounded across every profile and kind
        const due = await this.persistence.needsRefresh(
          profile.discordUserId,
          kind,
          username,
          this.now()
        )
        if (due) {
          // eslint-disable-next-line no-await-in-loop -- tasky: due refreshes stay sequential so startup cannot stampede Last.fm
          await traceBackgroundOperation(
            'jumble.library.refresh',
            { 'jumble.kind': kind, 'jumble.refresh.source': 'sweep' },
            () => this.refresh(profile.discordUserId, kind, username)
          ).catch(() => undefined)
        }
      }
    }
  }
  private timing(
    kind: JumbleKind,
    source: 'hit' | 'stale' | 'refreshed' | 'fallback',
    outcome: 'success' | 'failed',
    startedAt: number,
    candidateCount: number
  ): void {
    emitJumbleTiming(this.options.onTiming, {
      type: 'library',
      kind,
      source,
      outcome,
      durationMs: jumbleDurationMs(startedAt),
      candidateCount
    })
  }
}

function canonicalLastFmUsername(username: string): string {
  return username.trim().toLowerCase()
}
