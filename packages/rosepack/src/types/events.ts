import type { ClientEvents } from 'oceanic.js'

export type EventCallback<
  Event extends keyof ClientEvents = keyof ClientEvents
> = (
  ...args: Event extends keyof ClientEvents ? ClientEvents[Event] : unknown[]
) => void

export interface EventConfig {
  name?: string
  once?: boolean
  order?: number
}

export interface DefineEvent {
  <Event extends keyof ClientEvents = keyof ClientEvents>(
    callback: EventCallback<Event>
  ): RosepackEvent
  <Event extends keyof ClientEvents = keyof ClientEvents>(
    config: EventConfig,
    callback: EventCallback<Event>
  ): RosepackEvent
}

export type RosepackEventInput = string | RosepackEvent

export interface RosepackEvent {
  config: EventConfig
  callback: EventCallback<keyof ClientEvents>
}
