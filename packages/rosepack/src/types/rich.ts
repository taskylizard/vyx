import type {
  EmbedAuthorOptions,
  EmbedField,
  EmbedFooterOptions
} from 'oceanic.js'

export interface EmbedOptions {
  color?: string
  title?: string
  url?: string
  author?: EmbedAuthorOptions
  description?: string
  thumbnail?: string
  image?: string
  timestamp?: number | Date | boolean
  footer?: EmbedFooterOptions
  fields?: EmbedField[]
}
