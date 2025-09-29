import type { ModalSubmitInteraction, TextInputStyles } from 'oceanic.js'

interface TextInput {
  label?: string
  style: TextInputStyles
  maxLength?: number
  minLength?: number
  placeholder?: string
  value?: string
  required?: boolean
}

export type ModalInputs = Record<string, TextInput>

type InputValue<T extends TextInput> = T['required'] extends false
  ? string | null
  : string

export interface ModalConfig<T extends ModalInputs = ModalInputs> {
  id?: string
  title: string
  inputs?: T
}

export type ParsedInputs<T extends ModalInputs = ModalInputs> = {
  [K in keyof T]: InputValue<T[K]>
}

interface ModalContext<T extends ModalInputs = ModalInputs> {
  inputs: ParsedInputs<T>
}

export type ModalCallback<T extends ModalInputs = ModalInputs> = (
  interaction: ModalSubmitInteraction,
  context: ModalContext<T>
) => void

export type RosepackModalInput = string | RosepackModal

export interface RosepackModal<T extends ModalInputs = ModalInputs> {
  config: ModalConfig<T>
  callback: ModalCallback<T>
}
