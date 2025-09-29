import type { LoadConfigOptions } from 'c12'
import { watch } from 'chokidar'
import consola from 'consola'
import { colors } from 'consola/utils'
import type { Stats } from 'node:fs'
import { Collection } from 'oceanic.js'
import { resolve } from 'pathe'
import { debounce } from 'perfect-debounce'
import { getContext } from 'unctx'
import { version } from '../package.json'
import { initCient, refreshApplicationCommands } from './discord'
import {
  loadButtons,
  loadCommands,
  loadContextMenus,
  loadEvents,
  loadModals,
  loadPreconditions,
  loadSelectMenus
} from './load'
import { loadOptions } from './options'
import {
  registerAutocomplete,
  registerButtons,
  registerCommands,
  registerContextMenu,
  registerEvents,
  registerModals,
  registerSelectMenus
} from './register'
import {
  resolveButton,
  resolveCommand,
  resolveContextMenu,
  resolveEvent,
  resolveModal,
  resolvePrecondition,
  resolveSelectMenu
} from './resolve'
import {
  scanButtons,
  scanCommands,
  scanContextMenus,
  scanEvents,
  scanModals,
  scanPreconditions,
  scanSelectMenus
} from './scan'
import type {
  Rosepack,
  RosepackConfig,
  RosepackOptions,
  RuntimeRosepack
} from './types'

export const ctx = getContext<RuntimeRosepack>('rosepack')
export const useRosepack = ctx.use

const initRosepack = async (
  config: RosepackConfig,
  options: LoadConfigOptions
): Promise<Rosepack> => {
  const opts = await loadOptions(config, options)

  return {
    configFile: opts.configFile as string,
    options: opts.options as RosepackOptions,
    events: new Collection(),
    commands: new Collection(),
    contextMenus: new Collection(),
    components: {
      buttons: new Collection(),
      modals: new Collection(),
      selectMenus: new Collection()
    },
    preconditions: new Collection()
  }
}

const watchReload = (
  rosepack: Rosepack,
  config: RosepackConfig,
  opts: LoadConfigOptions
) => {
  const filesToWatch = [
    rosepack.options.dirs.commands,
    rosepack.options.dirs.events,
    rosepack.options.dirs.contextMenus,
    rosepack.options.dirs.components.buttons,
    rosepack.options.dirs.components.modals,
    rosepack.options.dirs.components.selectMenus,
    rosepack.options.dirs.preconditions
  ].map((file) => resolve(rosepack.options.rootDir, file))
  const watcher = watch([...filesToWatch, rosepack.configFile], {
    ignored: rosepack.options.ignore,
    ignoreInitial: true
  })
  const reload = debounce(
    async (event: string, path: string, stats: Stats | undefined) => {
      if (stats?.size === 0) return
      consola.info(
        `${colors.blue(event)}`,
        `${colors.gray(resolve(path).replace(rosepack.options.rootDir, ''))}`
      )
      clearRosepack(rosepack)
      try {
        await loadRosepack(rosepack, config, opts)
      } catch (error: any) {
        createError(error.message)
      }
    },
    100
  )

  watcher.on('all', (event, path, stats) => reload(event, path, stats))
}

export const createRosepack = async (
  config: RosepackConfig = {},
  opts: LoadConfigOptions = {}
) => {
  if (!process.env.DISCORD_CLIENT_TOKEN) {
    createError(
      'Client token is required. Please provide it in the environment variable DISCORD_CLIENT_TOKEN.'
    )
  }
  const rosepack = await initRosepack(config, opts)

  consola.log(colors.blue(`Rosepack ${colors.bold(version)}`))
  await loadRosepack(rosepack, config, opts)
  if (process.env.NODE_ENV === 'development') {
    watchReload(rosepack, config, opts)
  }

  return rosepack
}

const clearRosepack = async (rosepack: Rosepack) => {
  rosepack.client?.disconnect()
  rosepack.events.clear()
  rosepack.commands.clear()
  rosepack.contextMenus.clear()
  rosepack.components.buttons.clear()
  rosepack.components.modals.clear()
  rosepack.components.selectMenus.clear()
  rosepack.preconditions.clear()
}

const loadRosepack = async (
  rosepack: Rosepack,
  config: RosepackConfig,
  options: LoadConfigOptions
) => {
  const opts = await loadOptions(config, options)

  rosepack.configFile = opts.configFile as string
  rosepack.options = opts.options as RosepackOptions
  const [
    scannedEvents,
    scannedCommands,
    scannedContextMenus,
    scannedButtons,
    scannedModals,
    scannedSelectMenus,
    scannedPreconditions
  ] = await Promise.all([
    scanEvents(rosepack),
    scanCommands(rosepack),
    scanContextMenus(rosepack),
    scanButtons(rosepack),
    scanModals(rosepack),
    scanSelectMenus(rosepack),
    scanPreconditions(rosepack)
  ])
  const events = [...(rosepack.options.events || []), ...scannedEvents].map(
    (evt) => resolveEvent(evt, rosepack.options)
  )
  const commands = [
    ...(rosepack.options.commands || []),
    ...scannedCommands
  ].map((cmd) => resolveCommand(cmd, rosepack.options))
  const contextMenus = [
    ...(rosepack.options.contextMenus || []),
    ...scannedContextMenus
  ].map((ctm) => resolveContextMenu(ctm, rosepack.options))
  const buttons = [
    ...(rosepack.options.components?.buttons || []),
    ...scannedButtons
  ].map((btn) => resolveButton(btn, rosepack.options))
  const modals = [
    ...(rosepack.options.components?.modals || []),
    ...scannedModals
  ].map((mdl) => resolveModal(mdl, rosepack.options))
  const selectMenus = [
    ...(rosepack.options.components?.selectMenus || []),
    ...scannedSelectMenus
  ].map((slm) => resolveSelectMenu(slm, rosepack.options))
  const preconditions = [
    ...(rosepack.options.preconditions || []),
    ...scannedPreconditions
  ].map((prc) => resolvePrecondition(prc, rosepack.options))

  loadEvents(rosepack, events)
  loadCommands(rosepack, commands)
  loadContextMenus(rosepack, contextMenus)
  loadButtons(rosepack, buttons)
  loadModals(rosepack, modals)
  loadSelectMenus(rosepack, selectMenus)
  loadPreconditions(rosepack, preconditions)

  rosepack.client = initCient(rosepack.options)

  registerEvents(rosepack)
  await refreshApplicationCommands(rosepack)
  registerCommands(rosepack)
  registerContextMenu(rosepack)
  registerButtons(rosepack)
  registerModals(rosepack)
  registerSelectMenus(rosepack)
  registerAutocomplete(rosepack)
}

export const createError = (message: string) => {
  consola.error(new Error(message))
  process.exit(1)
}
