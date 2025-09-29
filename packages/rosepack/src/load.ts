import { helpCommand } from './builtins'
import type {
  Rosepack,
  RosepackButton,
  RosepackCommand,
  RosepackContextMenu,
  RosepackEvent,
  RosepackModal,
  RosepackPrecondition,
  RosepackSelectMenu
} from './types'

export const loadEvents = (rosepack: Rosepack, events: RosepackEvent[]) => {
  for (const evt of events) {
    if (evt.config.order) {
      rosepack.events.set(`${evt.config.order}.${evt.config.name!}`, evt)
    } else {
      rosepack.events.set(evt.config.name!, evt)
    }
  }
}

export const loadCommands = (
  rosepack: Rosepack,
  commands: RosepackCommand[]
) => {
  for (const cmd of commands) {
    rosepack.commands.set(cmd.config.name!, cmd)
  }
  if (!rosepack.commands.has('help')) {
    rosepack.commands.set('help', helpCommand as RosepackCommand<any>)
  }
}

export const loadContextMenus = (
  rosepack: Rosepack,
  contextMenus: RosepackContextMenu[]
) => {
  for (const ctm of contextMenus) {
    rosepack.contextMenus.set(ctm.config.name!, ctm)
  }
}

export const loadButtons = (rosepack: Rosepack, buttons: RosepackButton[]) => {
  for (const btn of buttons) {
    rosepack.components.buttons.set(btn.config.id!, btn)
  }
}

export const loadModals = (rosepack: Rosepack, modals: RosepackModal[]) => {
  for (const mdl of modals) {
    rosepack.components.modals.set(mdl.config.id!, mdl)
  }
}

export const loadSelectMenus = (
  rosepack: Rosepack,
  selectMenus: RosepackSelectMenu[]
) => {
  for (const slm of selectMenus) {
    rosepack.components.selectMenus.set(slm.config.id!, slm)
  }
}

export const loadPreconditions = (
  rosepack: Rosepack,
  preconditions: RosepackPrecondition[]
) => {
  for (const prc of preconditions) {
    rosepack.preconditions.set(prc.name!, prc)
  }
}
