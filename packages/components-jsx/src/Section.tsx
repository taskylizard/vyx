import {
  type ButtonComponent,
  ComponentTypes,
  type SectionComponent,
  type TextDisplayComponent,
  type ThumbnailComponent
} from 'oceanic.js'

import { childrenToArray } from './utils'

export interface SectionProps {
  children: TextDisplayComponent[]
  accessory: ThumbnailComponent | ButtonComponent
}

export function Section(
  { children, ...props }: SectionProps
): SectionComponent {
  return {
    type: ComponentTypes.SECTION,
    components: childrenToArray(children),
    ...props
  }
}
