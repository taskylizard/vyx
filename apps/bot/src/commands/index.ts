import EconomyCommand from './economy'
import FunCommand from './fun'
import ModerationCommand from './moderation'
import ModulesCommand from './modules'
import QueryEngineCommand from './query-engine'
import TaskylandCommand from './taskyland'
import AiCommand from './utilities/ai'
import ReminderCommand from './utilities/reminder'
import TranslateCommand from './utilities/translate'
import WikipediaCommand from './utilities/wikipedia'

export const slashCommands = {
  economy: EconomyCommand,
  fun: FunCommand,
  moderation: ModerationCommand,
  modules: ModulesCommand,
  'query-engine': QueryEngineCommand,
  reminder: ReminderCommand,
  translate: TranslateCommand,
  wikipedia: WikipediaCommand,
  taskyland: TaskylandCommand,
  ai: AiCommand
} as const
