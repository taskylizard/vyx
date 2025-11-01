import AdventOfCodePlugin from './adventofcode'
import AnalyticsPlugin from './analytics'
import askAi from './ask-ai'
import AutomodPlugin from './automod'
import EventsPlugin from './events'
import GuildSizeFilterPlugin from './guild-size-filter'
import PrivateersclubPlugin from './privateersclub'
import QueryEnginePlugin from './query-engine'
import TaskylandPlugin from './taskyland'

export const plugins = {
  askAi,
  automod: AutomodPlugin,
  adventofcode: AdventOfCodePlugin,
  analytics: AnalyticsPlugin,
  events: EventsPlugin,
  guildSizeFilter: GuildSizeFilterPlugin,
  privateersclub: PrivateersclubPlugin,
  taskyland: TaskylandPlugin,
  queryEngine: QueryEnginePlugin
} as const
