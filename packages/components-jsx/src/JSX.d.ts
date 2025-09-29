/** biome-ignore-all lint/style/useFilenamingConvention: nobody cares */

import type {
  ButtonComponent,
  ContainerComponent,
  FileComponent,
  MediaGalleryComponent,
  MediaGalleryItem,
  MediaItem,
  MentionableSelectMenu,
  MessageActionRow,
  RoleSelectMenu,
  SectionComponent,
  SeparatorComponent,
  StringSelectMenu,
  TextDisplayComponent,
  TextInput,
  ThumbnailComponent,
  UserSelectMenu
} from 'oceanic.js'

// biome-ignore lint/style/noNamespace: nobody cares
declare namespace JSX {
  interface ElementChildrenAttribute {
    children: {}
  }

  interface IntrinsicElements {
    br: any
  }

  type Element =
    | MessageActionRow
    | ButtonComponent
    | ContainerComponent
    | TextDisplayComponent
    | SectionComponent
    | SeparatorComponent
    | FileComponent
    | MediaGalleryComponent
    | ThumbnailComponent
    | StringSelectMenu
    | UserSelectMenu
    | RoleSelectMenu
    | MentionableSelectMenu
    | TextInput
    | MediaGalleryItem
    | MediaItem
    | any[]
}
