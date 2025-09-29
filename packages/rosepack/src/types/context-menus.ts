import type {
  CommandInteraction,
  Message,
  PermissionName,
  User
} from 'oceanic.js'

export type ContextMenuType = 'Message' | 'User'

export type ContextMenuCallback<T extends ContextMenuType = ContextMenuType> = (
  interaction: CommandInteraction,
  target: T extends 'Message' ? Message : User
) => void

export interface ContextMenuConfig<
  T extends ContextMenuType = ContextMenuType
> {
  id?: string
  name?: string
  type?: T
  userPermissions?: PermissionName[]
  dm?: boolean
  preconditions?: string[]
}

export interface DefineContextMenu {
  <T extends ContextMenuType = ContextMenuType>(
    callback: ContextMenuCallback<T>
  ): RosepackContextMenu<T>
  <T extends ContextMenuType = ContextMenuType>(
    config: ContextMenuConfig<T>,
    callback: ContextMenuCallback<T>
  ): RosepackContextMenu<T>
}

export type RosepackContextMenuInput = string | RosepackContextMenu

export interface RosepackContextMenu<
  T extends ContextMenuType = ContextMenuType
> {
  config: ContextMenuConfig<T>
  callback: ContextMenuCallback<T>
}
