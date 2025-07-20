import EconomyCommand from './economy'
import EightBallCommand from './fun/8ball'
import AICommand from './fun/ai'
import AnilistCommand from './fun/anilist'
import SayhiCommand from './fun/sayhi'
import TicTacToeCommand from './fun/tictactoe'
import EvalCommand from './moderation/eval'
import ReportCommand from './moderation/report'
import ModulesCommand from './modules'
import TaskylandCommand from './taskyland'
import GithubCommand from './utlities/github'
import NpmCommand from './utlities/npm'
import ReminderCommand from './utlities/reminder'
import SearchCommand from './utlities/search'
import TranslateCommand from './utlities/translate'
import WikipediaCommand from './utlities/wikipedia'

export const slashCommands = {
  '8ball': EightBallCommand,
  anilist: AnilistCommand,
  economy: EconomyCommand,
  eval: EvalCommand,
  github: GithubCommand,
  modules: ModulesCommand,
  npm: NpmCommand,
  reminder: ReminderCommand,
  report: ReportCommand,
  sayhi: SayhiCommand,
  translate: TranslateCommand,
  wikipedia: WikipediaCommand,
  taskyland: TaskylandCommand,
  tictactoe: TicTacToeCommand,
  ai: AICommand,
  search: SearchCommand
} as const
