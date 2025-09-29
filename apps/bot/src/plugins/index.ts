import AdventOfCodePlugin from './adventofcode'
import AnalyticsPlugin from './analytics'
import askAi from './ask-ai'
import AutomodPlugin from './automod'
import EventsPlugin from './events'
import PrivateersclubPlugin from './privateersclub'
import QueryEnginePlugin from './query-engine'
import TaskylandPlugin from './taskyland'
import WotakuPlugin from './wotaku'

export const plugins = {
  askAi,
  automod: AutomodPlugin,
  adventofcode: AdventOfCodePlugin,
  analytics: AnalyticsPlugin,
  events: EventsPlugin,
  privateersclub: PrivateersclubPlugin,
  taskyland: TaskylandPlugin,
  wotaku: WotakuPlugin,
  queryEngine: QueryEnginePlugin
} as const
