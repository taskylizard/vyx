import { join, relative } from 'pathe'
import { glob } from 'tinyglobby'
import type { Rosepack } from './types'

const GLOB_SCAN_PATTERN = '**/*.{js,ts}'

export const scanEvents = async (rosepack: Rosepack) => {
  const files = await scanFiles(rosepack, rosepack.options.dirs.events)

  return files.map((f: any) => f.fullPath)
}

export const scanCommands = async (rosepack: Rosepack) => {
  const files = await scanFiles(rosepack, rosepack.options.dirs.commands)
  return files.map((f: any) => f.fullPath)
}

export const scanContextMenus = async (rosepack: Rosepack) => {
  const files = await scanFiles(rosepack, rosepack.options.dirs.contextMenus)

  return files.map((f: any) => f.fullPath)
}

export const scanButtons = async (rosepack: Rosepack) => {
  const buttonsDir = join(
    rosepack.options.dirs.components.dir,
    rosepack.options.dirs.components.buttons
  )
  const files = await scanFiles(rosepack, buttonsDir)

  return files.map((f: any) => f.fullPath)
}

export const scanModals = async (rosepack: Rosepack) => {
  const modalsDir = join(
    rosepack.options.dirs.components.dir,
    rosepack.options.dirs.components.modals
  )
  const files = await scanFiles(rosepack, modalsDir)

  return files.map((f: any) => f.fullPath)
}

export const scanSelectMenus = async (rosepack: Rosepack) => {
  const selectMenusDir = join(
    rosepack.options.dirs.components.dir,
    rosepack.options.dirs.components.selectMenus
  )
  const files = await scanFiles(rosepack, selectMenusDir)

  return files.map((f: any) => f.fullPath)
}

export const scanPreconditions = async (rosepack: Rosepack) => {
  const files = await scanFiles(rosepack, rosepack.options.dirs.preconditions)

  return files.map((f: any) => f.fullPath)
}

const scanFiles = async (rosepack: Rosepack, name: string) => {
  const files = await Promise.all(
    rosepack.options.scanDirs!.map((dir) => scanDir(rosepack, dir, name))
  ).then((r) => r.flat())

  return files
}

const scanDir = async (rosepack: Rosepack, dir: string, name: string) => {
  const fileNames = await glob([join(name, GLOB_SCAN_PATTERN)], {
    cwd: dir,
    dot: true,
    ignore: rosepack.options.ignore,
    absolute: true
  })

  return fileNames
    .map((fullPath: any) => {
      return {
        fullPath,
        path: relative(join(dir, name), fullPath)
      }
    })
    .sort((a: any, b: any) => a.path.localeCompare(b.path))
}
