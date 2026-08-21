import { sleep } from 'radashi'
import type { Client, Message } from 'oceanic.js'
import type { KanikouResponder } from '../llm/responder.ts'
import { safeSendTyping } from '../discord/safe-actions.ts'
import { setActiveSpanAttributes, traceOperation } from '../observability/tracing.ts'
import type { KanikouLogger } from '../observability/types.ts'
import { sendChime, toChimeObservation } from './discord.ts'
import { evaluateChimeGate } from './gate.ts'
import { buildChimePrompt, isChimeSkip } from './prompt.ts'
import { CHIME_SCOPE, CHIME_SETTINGS } from './settings.ts'
import type { ChimeObservation, ChimeSettings } from './types.ts'

const MAX_TRACKED_OBSERVATIONS = 50
const OBSERVATION_RETENTION_MS = 30 * 60 * 1000

export interface ChimeWatcherOptions {
  client: Client
  logger: KanikouLogger
  responder: KanikouResponder
  settings?: ChimeSettings
}

/**
 * Watches human chatter in the chime scope, keeps a bounded rolling window of
 * observations per channel, and rarely lets kanikou join conversations that
 * are lively, unbroken, and untouched by a recent chime.
 */
export class ChimeWatcher {
  readonly #client: Client
  readonly #lastChimeAt = new Map<string, number>()
  readonly #logger: KanikouLogger
  readonly #observations = new Map<string, ChimeObservation[]>()
  readonly #responder: KanikouResponder
  readonly #settings: ChimeSettings

  constructor(options: ChimeWatcherOptions) {
    this.#client = options.client
    this.#logger = options.logger
    this.#responder = options.responder
    this.#settings = options.settings ?? CHIME_SETTINGS
  }

  /** Records human chatter and starts a chime attempt when the gate allows it. */
  observe(botUserID: string, message: Message): void {
    if (message.guildID !== CHIME_SCOPE.guildID || message.channelID !== CHIME_SCOPE.channelID) {
      return
    }

    if (message.content.trim().length === 0) {
      return
    }

    this.#record(message.channelID, toChimeObservation(message))
    void this.#attempt(botUserID, message.channelID)
  }

  async #attempt(botUserID: string, channelID: string): Promise<void> {
    try {
      await traceOperation(
        'chime.attempt',
        { attributes: { 'discord.channel.id': channelID }, parent: 'root' },
        async () => {
          const now = Date.now()
          const observations = this.#observations.get(channelID) ?? []
          const verdict = evaluateChimeGate(
            { lastChimeAt: this.#lastChimeAt.get(channelID), now, observations },
            this.#settings,
            Math.random
          )

          if (verdict.kind === 'hold') {
            setActiveSpanAttributes({ 'kanikou.chime.verdict': verdict.reason })
            return
          }

          // Reserve the cooldown before any async work so concurrent messages
          // can never double-chime.
          this.#lastChimeAt.set(channelID, now)

          const prompt = buildChimePrompt(verdict.observations)
          const content = (
            await this.#responder.generateWithoutTools(prompt.messages, prompt.instructions)
          ).trim()

          if (content.length === 0 || isChimeSkip(content)) {
            setActiveSpanAttributes({ 'kanikou.chime.verdict': 'declined' })
            return
          }

          await safeSendTyping(this.#client, channelID)
          await sleep(this.#sendDelay())

          await sendChime(this.#client, channelID, content)
          setActiveSpanAttributes({ 'kanikou.chime.verdict': 'sent' })
          this.#logger.info('chime delivered', {
            botUserID,
            channelID,
            historyMessages: verdict.observations.length
          })
        }
      )
    } catch (error) {
      this.#logger.warn('chime attempt failed', { error })
    }
  }

  #record(channelID: string, observation: ChimeObservation): void {
    const cutoff = Date.now() - OBSERVATION_RETENTION_MS
    const retained = [...(this.#observations.get(channelID) ?? []), observation].filter(
      (entry) => entry.timestamp >= cutoff
    )

    this.#observations.set(channelID, retained.slice(-MAX_TRACKED_OBSERVATIONS))
  }

  #sendDelay(): number {
    const { maxSendDelayMs, minSendDelayMs } = this.#settings
    return minSendDelayMs + Math.floor(Math.random() * (maxSendDelayMs - minSendDelayMs))
  }
}
