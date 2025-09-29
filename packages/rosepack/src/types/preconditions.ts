import type { CommandInteraction, ComponentInteraction } from 'oceanic.js'

export type PreconditionType = 'ChatInput' | 'ContextMenu'

export type PreconditionCallback<
  T extends PreconditionType = PreconditionType
> = (
  interaction: T extends 'ChatInput' ? CommandInteraction
    : ComponentInteraction
) => Promise<boolean> | Promise<void> | boolean | void

export interface DefinePrecondition {
  <T extends PreconditionType>(
    callback: PreconditionCallback<T>
  ): RosepackPrecondition<T>
  <T extends PreconditionType>(
    name: string,
    callback: PreconditionCallback<T>
  ): RosepackPrecondition<T>
}

export type RosepackPreconditionInput = string | RosepackPrecondition

export interface RosepackPrecondition<
  T extends PreconditionType = PreconditionType
> {
  name: string
  callback: PreconditionCallback<T>
}
