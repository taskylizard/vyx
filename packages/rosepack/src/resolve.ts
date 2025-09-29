import consola from 'consola'
import createJiti from 'jiti'
import { resolve } from 'pathe'
import { filename } from 'pathe/utils'
import type {
  ButtonConfig,
  CommandConfig,
  ContextMenuConfig,
  ContextMenuType,
  EventConfig,
  ModalConfig,
  Rosepack,
  RosepackButton,
  RosepackButtonInput,
  RosepackCommand,
  RosepackCommandInput,
  RosepackContextMenu,
  RosepackContextMenuInput,
  RosepackEvent,
  RosepackEventInput,
  RosepackModal,
  RosepackModalInput,
  RosepackPrecondition,
  RosepackPreconditionInput,
  RosepackSelectMenu,
  RosepackSelectMenuInput,
  SelectMenuConfig
} from './types'

export const resolveEvent = (
  evt: RosepackEventInput,
  rosepackOptions: Rosepack['options']
): RosepackEvent => {
  if (typeof evt === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _evtPath = jiti.resolve(evt)
    const event = jiti(_evtPath) as RosepackEvent

    if (!event.config || !event.callback) {
      consola.warn(
        `Event \`${filename(_evtPath)}\` does not export a valid event.`
      )
      return { config: { name: filename(_evtPath) }, callback: () => {} }
    }
    const eventFilename = filename(_evtPath) ?? ''
    const matchPrefix = eventFilename.match(/^[0-9]+\./)
    const matchSuffix = eventFilename.match(/\.(on|once)?$/)
    const name = eventFilename
      .replace(/^[0-9]+\./, '')
      .replace(/\.(on|once)$/, '')
    const order = matchPrefix
      ? parseInt(matchPrefix[0]?.slice(0, -1) ?? '0')
      : undefined
    const once = matchSuffix && matchSuffix[1]
      ? matchSuffix[1] === 'once'
      : undefined
    const config: EventConfig = {
      name: event.config.name ?? name,
      once: event.config.once ?? once,
      order: event.config.order ?? order
    }

    return { config, callback: event.callback }
  } else {
    return evt
  }
}

export const resolveCommand = (
  cmd: RosepackCommandInput,
  rosepackOptions: Rosepack['options']
): RosepackCommand => {
  if (typeof cmd === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _cmdPath = jiti.resolve(cmd)
    const command = jiti(_cmdPath) as RosepackCommand

    if (!command.config || !command.execute) {
      consola.warn(
        `Command \`${filename(_cmdPath)}\` does not export a valid command.`
      )
      return { config: { name: filename(_cmdPath) }, execute: () => {} }
    }
    const relativePath = resolve(_cmdPath).replace(rosepackOptions.rootDir, '')
    const categoryMatch = relativePath.match(
      /\/commands\/(.+?)\/[^/]+\.(ts|js)/
    )
    const name = filename(_cmdPath)
    const category = categoryMatch ? categoryMatch[1] : undefined
    const config: CommandConfig = {
      name: command.config.name ?? name,
      category: command.config.category ?? category,
      ...command.config
    }

    return { config, execute: command.execute }
  } else {
    return cmd
  }
}

export const resolveContextMenu = (
  ctm: RosepackContextMenuInput,
  rosepackOptions: Rosepack['options']
): RosepackContextMenu => {
  if (typeof ctm === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _ctmPath = jiti.resolve(ctm)
    const contextMenu = jiti(_ctmPath) as RosepackContextMenu

    if (!contextMenu.config || !contextMenu.callback) {
      consola.warn(
        `Context Menu \`${
          filename(_ctmPath)
        }\` does not export a valid context menu.`
      )
      return { config: { name: filename(_ctmPath) }, callback: () => {} }
    }
    const ctmFilename = filename(_ctmPath) ?? ''
    const matchSuffix = ctmFilename.match(/\.(user|message)$/)
    const name = ctmFilename.replace(/\.(user|message)$/, '')
    const type = matchSuffix && matchSuffix[1]
      ? (matchSuffix[1] as ContextMenuType)
      : 'Message'
    const config: ContextMenuConfig = {
      name: contextMenu.config.name ?? name,
      type: contextMenu.config.type ?? type,
      ...contextMenu.config
    }

    return { config, callback: contextMenu.callback }
  } else {
    return ctm
  }
}

export const resolveButton = (
  btn: RosepackButtonInput,
  rosepackOptions: Rosepack['options']
): RosepackButton => {
  if (typeof btn === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _btnPath = jiti.resolve(btn)
    const button = jiti(_btnPath) as RosepackButton

    if (!button.config || !button.callback) {
      consola.warn(
        `Button \`${filename(_btnPath)}\` does not export a valid button.`
      )
      return {
        config: { id: filename(_btnPath), label: '' },
        callback: () => {}
      }
    }
    const config: ButtonConfig = {
      id: button.config.id || filename(_btnPath),
      ...button.config
    }

    return { config, callback: button.callback }
  } else {
    return btn
  }
}

export const resolveModal = (
  mdl: RosepackModalInput,
  rosepackOptions: Rosepack['options']
): RosepackModal => {
  if (typeof mdl === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _mdlPath = jiti.resolve(mdl)
    const modal = jiti(_mdlPath) as RosepackModal

    if (!modal.config || !modal.callback) {
      consola.warn(
        `Modal \`${filename(_mdlPath)}\` does not export a valid modal.`
      )
      return {
        config: { id: filename(_mdlPath), title: '' },
        callback: () => {}
      }
    }
    const config: ModalConfig = {
      id: modal.config.id || filename(_mdlPath),
      ...modal.config
    }

    return { config, callback: modal.callback }
  } else {
    return mdl
  }
}

export const resolveSelectMenu = (
  slm: RosepackSelectMenuInput,
  rosepackOptions: Rosepack['options']
): RosepackSelectMenu => {
  if (typeof slm === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _slmPath = jiti.resolve(slm)
    const selectMenu = jiti(_slmPath) as RosepackSelectMenu

    if (!selectMenu.config || !selectMenu.callback) {
      consola.warn(
        `Select Menu \`${
          filename(_slmPath)
        }\` does not export a valid select menu.`
      )
      return {
        config: {
          id: filename(_slmPath),
          placeholder: '',
          type: 'String',
          options: []
        },
        callback: () => {}
      }
    }
    const config: SelectMenuConfig = {
      id: selectMenu.config.id || filename(_slmPath),
      ...selectMenu.config
    }

    return { config, callback: selectMenu.callback }
  } else {
    return slm
  }
}

export const resolvePrecondition = (
  prc: RosepackPreconditionInput,
  rosepackOptions: Rosepack['options']
): RosepackPrecondition => {
  if (typeof prc === 'string') {
    const jiti = createJiti(rosepackOptions.rootDir, {
      cache: false,
      interopDefault: true,
      requireCache: false
    })
    const _prcPath = jiti.resolve(prc)
    const precondition = jiti(_prcPath) as RosepackPrecondition
    const fallbackName = filename(_prcPath) ?? _prcPath

    if (!precondition.callback) {
      consola.warn(
        `Precondition \`${fallbackName}\` does not export a valid precondition.`
      )
      return { name: fallbackName, callback: () => {} }
    }
    const resolvedPrecondition: RosepackPrecondition = {
      name: precondition.name ?? fallbackName,
      callback: precondition.callback
    }

    return resolvedPrecondition
  }

  return prc
}
