import { createRosepack } from 'rosepack'
import type { AppContext } from './context.ts'

/**
 * The application binds its own context type once. Commands importing these
 * helpers then receive the same typed services without repeating generics.
 */
export const rosepack = createRosepack<AppContext>({
  onUnknownCommand({ interaction }) {
    console.warn(`Ignoring unknown command: ${interaction.data.name}`)
  }
})

export const { slashCommand, subcommand } = rosepack
