import askCommand from './ask.ts'
import memoryCommand from './memory.ts'

export const slashCommands = [askCommand, memoryCommand] as const
