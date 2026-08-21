/** A trimmed snapshot of one human message seen in a watched channel. */
export interface ChimeObservation {
  readonly authorID: string
  readonly authorName: string
  readonly content: string
  readonly id: string

  /** Epoch milliseconds at which the message was sent. */
  readonly timestamp: number
}

/** Tunable behavior for spontaneous chimes. */
export interface ChimeSettings {
  /** Per-message chance of chiming once every other gate condition passes. */
  readonly chance: number

  /** Minimum time between two chimes in the same channel. */
  readonly cooldownMs: number

  /** Upper bound of the humanized pause between typing and sending. */
  readonly maxSendDelayMs: number

  /** Maximum silence between consecutive messages before the flow counts as broken. */
  readonly maxGapMs: number

  /** Minimum distinct human authors required inside the window. */
  readonly minAuthors: number

  /** Minimum human messages required inside the window. */
  readonly minMessages: number

  /** Lower bound of the humanized pause between typing and sending. */
  readonly minSendDelayMs: number

  /** Lookback window that defines a lively conversation. */
  readonly windowMs: number
}
