import { defineModules } from 'rosepack'

/** Guild-scoped feature modules exposed by Kanikou. */
export const modules = defineModules({
  ai: {
    description: 'AI-backed memory features',
    label: '🤖 AI'
  },
  jumble: {
    description: 'Text and pixel-art music guessing games',
    label: '🧩 Jumble'
  }
})
