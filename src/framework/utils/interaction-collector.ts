import EventEmitter from 'node:events'
import type {
  AnyInteractionGateway,
  ComponentInteraction,
  Message
} from 'oceanic.js'
import type { Client } from '../client'

type Filter = (interaction: ComponentInteraction) => boolean

export interface InteractionCollectorOptions {
  message: Message
  filter: Filter
  time: number
}

export declare interface InteractionCollectorInterface {
  on(
    event: 'collect',
    listener: (interaction: ComponentInteraction) => void | Promise<void>
  ): this
  off(
    event: 'collect',
    listener: (interaction: ComponentInteraction) => void | Promise<void>
  ): this
  emit(event: 'collect', interaction: ComponentInteraction): boolean
}

export class InteractionCollector
  extends EventEmitter
  implements InteractionCollectorInterface
{
  public readonly client: Client
  public filter: Filter
  public message: Message
  public time: number

  private timeout: NodeJS.Timeout
  private boundListener: typeof this.listener

  public constructor(client: Client, options: InteractionCollectorOptions) {
    super()

    this.client = client
    this.filter = options.filter
    this.message = options.message
    this.time = options.time

    this.boundListener = this.listener.bind(this)
    this.client.on('interactionCreate', this.boundListener)
    this.timeout = setTimeout(() => this.stop(), this.time)
  }

  private listener(interaction: AnyInteractionGateway) {
    if (
      interaction.type !== 3 ||
      interaction.message.id !== this.message.id ||
      !this.filter(interaction)
    )
      return

    this.emit('collect', interaction)
  }

  public stop() {
    this.client.off('interactionCreate', this.boundListener)
    clearTimeout(this.timeout)
  }
}
