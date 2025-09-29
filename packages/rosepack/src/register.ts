import consola from 'consola'
import { ApplicationCommandTypes, ComponentTypes } from 'oceanic.js'
import type { ClientEvents } from 'oceanic.js'
import { createError, ctx } from './rosepack'
import type {
  ParsedInputs,
  ParsedOptions,
  Rosepack,
  RuntimeRosepack
} from './types'
import { resolveOption } from './utils'

export const registerEvents = (rosepack: Rosepack) => {
  for (const [, event] of rosepack.events) {
    const eventName = event.config.name

    if (!eventName || eventName === 'ready') continue
    const name = eventName as keyof ClientEvents

    if (event.config.once) {
      rosepack.client?.once(name, (...args) => {
        ctx.call(
          rosepack as RuntimeRosepack,
          () => event.callback(...(args as ClientEvents[typeof name]))
        )
      })
    } else {
      rosepack.client?.on(name, (...args) => {
        ctx.call(
          rosepack as RuntimeRosepack,
          () => event.callback(...(args as ClientEvents[typeof name]))
        )
      })
    }
  }
}

export const registerCommands = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommandInteraction()) return
    if (interaction.data.type !== ApplicationCommandTypes.CHAT_INPUT) return

    const cmd = rosepack.commands.get(interaction.data.name)

    if (!cmd) return
    const cmdOptions = Object.entries(cmd.config.options ?? {})
    const options = await cmdOptions.reduce<Promise<ParsedOptions>>(
      async (acc, [name, option]) => {
        const resolvedAcc = await acc
        const resolvedOption = await resolveOption(
          interaction,
          option.type,
          name
        )

        return {
          ...resolvedAcc,
          [name]: resolvedOption
        }
      },
      Promise.resolve({})
    )

    if (cmd.config.preconditions) {
      for (const prc of cmd.config.preconditions) {
        const precondition = rosepack.preconditions.get(prc)

        if (!precondition) {
          consola.warn(`Precondition \`${prc}\` not found.`)
          continue
        }
        const result = await ctx.call(
          rosepack as RuntimeRosepack,
          async () => await precondition.callback(interaction)
        )

        if (!result) return
      }
    }
    ctx.call(
      rosepack as RuntimeRosepack,
      () => cmd.execute(interaction, { options })
    )
  })
}

export const registerContextMenu = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommandInteraction()) return
    if (interaction.data.type === ApplicationCommandTypes.CHAT_INPUT) return

    const ctm = rosepack.contextMenus.get(interaction.data.name)

    if (!ctm) return
    if (ctm.config.preconditions) {
      for (const prc of ctm.config.preconditions) {
        const precondition = rosepack.preconditions.get(prc)

        if (!precondition) {
          consola.warn(`Precondition \`${prc}\` not found.`)
          continue
        }
        const result = await ctx.call(
          rosepack as RuntimeRosepack,
          async () => await precondition.callback(interaction)
        )

        if (!result) return
      }
    }
    const target = interaction.data.target

    if (!target) return
    ctm.callback(interaction, target)
  })
}

export const registerButtons = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', (interaction) => {
    if (!interaction.isComponentInteraction()) return
    if (interaction.data.componentType !== ComponentTypes.BUTTON) return

    const btn = rosepack.components.buttons.get(interaction.data.customID)

    if (!btn) return
    btn.callback(interaction)
  })
}

export const registerModals = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', (interaction) => {
    if (!interaction.isModalSubmitInteraction()) return

    const mdl = rosepack.components.modals.get(interaction.data.customID)

    if (!mdl) return
    const inputs = Object.entries(mdl.config.inputs ?? {}).reduce<
      Record<string, string | null>
    >((acc, [input, config]) => {
      const required = config?.required ?? true
      const value = required
        ? interaction.data.components.getTextInput(input, true)
        : interaction.data.components.getTextInput(input, false) ?? null

      return {
        ...acc,
        [input]: value
      }
    }, {})

    mdl.callback(interaction, { inputs: inputs as ParsedInputs })
  })
}

export const registerSelectMenus = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', (interaction) => {
    if (!interaction.isComponentInteraction()) return
    if (interaction.data.componentType === ComponentTypes.BUTTON) return

    const slm = rosepack.components.selectMenus.get(interaction.data.customID)

    if (!slm) return
    const selected = interaction.data.values.raw

    slm.callback(interaction, selected)
  })
}

export const registerAutocomplete = (rosepack: Rosepack) => {
  rosepack.client?.on('interactionCreate', async (interaction) => {
    if (!interaction.isAutocompleteInteraction()) return

    const cmd = rosepack.commands.get(interaction.data.name)

    if (!cmd || !cmd.config.autocomplete) return
    try {
      await ctx.call(
        rosepack as RuntimeRosepack,
        async () => await cmd.config.autocomplete!(interaction)
      )
    } catch (error: unknown) {
      createError(error instanceof Error ? error.message : String(error))
    }
  })
}
