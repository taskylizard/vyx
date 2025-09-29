import type {
  ChannelTypes,
  ComponentInteraction,
  PartialEmoji,
  SelectMenuDefaultValue
} from 'oceanic.js'

export type SelectMenuType =
  | 'String'
  | 'User'
  | 'Channel'
  | 'Role'
  | 'Mentionable'

export type SelectMenuCallback<T extends SelectMenuType = SelectMenuType> = (
  interaction: ComponentInteraction,
  selected: string[]
) => void

interface StringOptionDef {
  label: string
  value: string
  description?: string
  emoji?: PartialEmoji
  default?: boolean
}

export interface StringSelectMenuConfig {
  type: 'String'
  options: StringOptionDef[]
}

export interface UserSelectMenuConfig {
  type: 'User'
  defaultUsers?: string[]
}

export interface ChannelSelectMenuConfig {
  type: 'Channel'
  channelTypes?: ChannelTypes[]
  defaultChannels?: string[]
}

export interface RoleSelectMenuConfig {
  type: 'Role'
  defaultRoles?: string[]
}

export interface MentionableSelectMenuConfig {
  type: 'Mentionable'
  defaultValues?: SelectMenuDefaultValue[]
}

interface BaseSelectMenuConfig {
  id?: string
  placeholder: string
  disabled?: boolean
  minValues?: number
  maxValues?: number
}

export type SelectMenuConfig =
  & BaseSelectMenuConfig
  & (
    | StringSelectMenuConfig
    | UserSelectMenuConfig
    | ChannelSelectMenuConfig
    | RoleSelectMenuConfig
    | MentionableSelectMenuConfig
  )

export type RosepackSelectMenuInput = string | RosepackSelectMenu

export interface RosepackSelectMenu<T extends SelectMenuType = SelectMenuType> {
  config: SelectMenuConfig
  callback: SelectMenuCallback<T>
}
