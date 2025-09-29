import type {
  ButtonStyles,
  ComponentInteraction,
  PartialEmoji
} from 'oceanic.js'

type ButtonCallback = (interaction: ComponentInteraction) => void

export interface ButtonConfig {
  id?: string
  label: string
  style?: ButtonStyles
  emoji?: PartialEmoji
  url?: string
  disabled?: boolean
}

export type DefineButton = (
  config: ButtonConfig,
  callback: ButtonCallback
) => RosepackButton

export type RosepackButtonInput = string | RosepackButton

export interface RosepackButton {
  config: ButtonConfig
  callback: ButtonCallback
}
