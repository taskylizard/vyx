import type { C12InputConfig } from 'c12'
import type { Client, ClientOptions } from 'oceanic.js'
import { Collection } from 'oceanic.js'
import type { RosepackButton, RosepackButtonInput } from './buttons'
import type { RosepackCommand, RosepackCommandInput } from './commands'
import type {
  RosepackContextMenu,
  RosepackContextMenuInput
} from './context-menus'
import type { RosepackEvent, RosepackEventInput } from './events'
import type { RosepackModal, RosepackModalInput } from './modals'
import type {
  RosepackPrecondition,
  RosepackPreconditionInput
} from './preconditions'
import type {
  RosepackSelectMenu,
  RosepackSelectMenuInput
} from './select-menus'

interface RosepackDirs {
  events: string
  commands: string
  contextMenus: string
  components: {
    dir: string
    buttons: string
    modals: string
    selectMenus: string
  }
  preconditions: string
}

interface RuntimeEnv {
  [key: string]: string | undefined
}

export interface RosepackOptions {
  rootDir: string
  srcDir: string
  scanDirs: string[]
  dirs: RosepackDirs
  ignore: string[]
  events: RosepackEventInput[]
  commands: RosepackCommandInput[]
  contextMenus: RosepackContextMenuInput[]
  components: {
    buttons: RosepackButtonInput[]
    modals: RosepackModalInput[]
    selectMenus: RosepackSelectMenuInput[]
  }
  preconditions: RosepackPreconditionInput[]
  client: ClientOptions
  clientId: string
  env: RuntimeEnv
}

type DeepPartial<T> = T extends Record<string, any>
  ? { [P in keyof T]?: DeepPartial<T[P]> | T[P] }
  : T

export interface RosepackConfig
  extends DeepPartial<RosepackOptions>, C12InputConfig<RosepackConfig>
{}

export interface Rosepack {
  configFile: string
  options: RosepackOptions
  client?: Client
  events: Collection<string, RosepackEvent>
  commands: Collection<string, RosepackCommand>
  contextMenus: Collection<string, RosepackContextMenu>
  components: {
    buttons: Collection<string, RosepackButton>
    modals: Collection<string, RosepackModal>
    selectMenus: Collection<string, RosepackSelectMenu>
  }
  preconditions: Collection<string, RosepackPrecondition>
}

export interface RuntimeRosepack extends Rosepack {
  client: Client
}
