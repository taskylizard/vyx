import adminCommand from './admin.ts'
import notesCommand from './notes.ts'
import pingCommand from './ping.ts'

export const commands = [adminCommand, notesCommand, pingCommand] as const
