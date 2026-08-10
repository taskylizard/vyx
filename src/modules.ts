import { defineModules } from 'rosepack'

export const modules = defineModules({
  ai: {
    description: 'AI stuff',
    label: 'AI'
  },
  autoembeds: {
    description: 'autoembeds for Twitter, Instagram, and Reddit links',
    label: 'Autoembeds'
  },
  jumble: {
    description: 'Text and pixel-art music guessing game stuff',
    label: 'Jumble'
  }
})
