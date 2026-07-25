import askCommand from './ask.ts'
import jumbleCommand from './jumble.ts'
import memoryCommand from './memory.ts'
import modulesCommand from './modules.ts'

export const slashCommands = [askCommand, jumbleCommand, memoryCommand, modulesCommand] as const
