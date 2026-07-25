import { MessageFlags } from 'oceanic.js'
import { createRosepack } from 'rosepack'
import { match } from 'ts-pattern'
import { modules } from '../modules.ts'
import type { BotContext } from './context.ts'

const knownModuleIDs = new Set(Object.keys(modules))

/** Kanikou's rosepack instance, bound to the services available to command handlers. */
export const rosepack = createRosepack<BotContext>({
  onUnknownCommand({ app, interaction }) {
    app.logger.debug(`received unregistered slash command ${interaction.data.name}`)
  }
}).withModules({
  catalog: modules,
  async read({ app, applicationID, guildID }) {
    return filterKnownModules(await app.moduleStore.read({ applicationID, guildID }))
  },
  async mutate({ app, applicationID, enabled, guildID, module }) {
    const result = await app.moduleStore.mutate({ applicationID, enabled, guildID, module })
    return { ...result, modules: filterKnownModules(result.modules) }
  },
  async readOwnedCommandKeys({ app, applicationID, guildID }) {
    return app.moduleStore.readOwnedCommandKeys({ applicationID, guildID })
  },
  async writeOwnedCommandKeys({ app, applicationID, guildID, keys }) {
    await app.moduleStore.writeOwnedCommandKeys({ applicationID, guildID, keys })
  },
  async onDisabled({ interaction, module }) {
    await match(interaction.acknowledged)
      .with(true, async () => undefined)
      .otherwise(async () => {
        await interaction.createMessage({
          content: `${module.label} is disabled in this server. Ask the bot owner to enable it with /modules enable.`,
          flags: MessageFlags.EPHEMERAL
        })
      })
  }
})

function filterKnownModules(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => knownModuleIDs.has(value)))])
}

export const { button, component, modal, slash, slashSub } = rosepack
