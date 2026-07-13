export const KANIKOU_MODEL = 'google/gemini-3-flash-preview'

export const KANIKOU_MODEL_SETTINGS = {
  model: KANIKOU_MODEL,
  temperature: 0.4,
  toolChoice: 'auto',
  topP: 0.8
} as const
