import EvalCommand from './eval'
import ExampleCommand from './example'

export const prefixCommands = {
  eval: EvalCommand,
  greet: ExampleCommand
} as const
