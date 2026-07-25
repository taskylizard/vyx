import { createRosepack } from 'rosepack'
import type { BotContext } from './context.ts'

/** Kanikou's rosepack instance, bound to the services available to command handlers. */
export const rosepack = createRosepack<BotContext>({
  onUnknownCommand({ app, interaction }) {
    app.logger.debug(`received unregistered slash command ${interaction.data.name}`)
  }
})

export const { button, component, modal, slash, slashSub } = rosepack
