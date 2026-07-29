import { defineModules } from 'rosepack'

/** Guild-scoped feature modules exposed by Kanikou. */
export const modules = defineModules({
  ai: {
    description: 'AI memory and reply features',
    label: '🤖 AI'
  },
  autoembeds: {
    description: 'Auto-embeds for Twitter, Instagram, and Reddit links',
    label: '🔗 Autoembeds'
  },
  jumble: {
    description: 'Text and pixel-art music guessing games',
    label: '🧩 Jumble'
  }
})
