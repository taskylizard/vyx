import {
  ComponentTypes,
  type TextInput as TextInputComponent
} from 'oceanic.js'

export { TextInputStyles } from 'oceanic.js'

export type TextInputProps = Omit<TextInputComponent, 'type'>

export function TextInput(props: TextInputProps): TextInputComponent {
  return {
    type: ComponentTypes.TEXT_INPUT,
    ...props
  }
}
