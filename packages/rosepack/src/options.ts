import type { LoadConfigOptions } from 'c12'
import { loadConfig } from 'c12'
import defu from 'defu'
import { resolve } from 'pathe'
import { createError } from './rosepack'
import type { RosepackConfig } from './types'

const RosepackDefaults: RosepackConfig = {
  scanDirs: [],
  ignore: [],
  commands: [],
  events: [],
  contextMenus: [],
  preconditions: []
}

export const loadOptions = async (
  configOverrides: RosepackConfig = {},
  opts: LoadConfigOptions
) => {
  const { config, configFile } = await loadConfig<RosepackConfig>({
    name: 'rosepack',
    configFile: 'rosepack.config',
    dotenv: true,
    overrides: configOverrides,
    defaults: RosepackDefaults,
    ...opts
  })

  if (!config) {
    return createError('No configuration found')
  }
  const options = config

  options.rootDir = resolve(options.rootDir || '.')
  options.srcDir = resolve(options.srcDir || options.rootDir)
  options.scanDirs?.unshift(options.srcDir)
  options.scanDirs = options.scanDirs?.map((dir) =>
    resolve(options.srcDir!, dir!)
  )
  options.scanDirs = [...new Set(options.scanDirs)]

  options.client = options.client || {}
  options.dirs = defu(options.dirs, {
    commands: 'commands',
    events: 'events',
    contextMenus: 'context-menus',
    components: {
      dir: 'components',
      buttons: 'buttons',
      modals: 'modals',
      selectMenus: 'select-menus'
    },
    preconditions: 'preconditions'
  })

  return { options, configFile }
}
