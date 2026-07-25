import askCommand from './ask.ts'
import jumbleCommand from './jumble.ts'
import memoryCommand from './memory.ts'

export const slashCommands = [askCommand, jumbleCommand, memoryCommand] as const
