const KANIKOU_MODEL_CUTOFF = new Date('2026-08-28T00:00:00.000Z')

export const KANIKOU_MODEL_PRE_CUTOFF = 'google/gemini-3.7-flash'
export const KANIKOU_MODEL_FALLBACK = 'google/gemini-3-flash-preview'

/**
 * Resolves the Kanikou LLM model based on the current date.
 *
 * Before the cutoff (through August 27) the preferred `google/gemini-3.7-flash`
 * is used. After the cutoff the model falls back to `google/gemini-3-flash-preview`.
 * The date is checked on every call so the selection stays current.
 */
export function getKanikouModel(): string {
  return new Date() < KANIKOU_MODEL_CUTOFF ? KANIKOU_MODEL_PRE_CUTOFF : KANIKOU_MODEL_FALLBACK
}

export const KANIKOU_MODEL_SETTINGS = {
  temperature: 0.4,
  toolChoice: 'auto',
  topP: 0.8
} as const
