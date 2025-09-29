import type { AnalyticsModule } from './analytics'
import type { EconomyModule } from './economy'
import type { PersonalityEngineModule } from './personality-engine'
import type { QueryEngineModule } from './query-engine'
import type { SchedulerModule } from './scheduler'
import type { ShopModule } from './shop'

export * from './analytics'
export * from './economy'
export * from './personality-engine'
export * from './query-engine'
export * from './scheduler'
export * from './shop'

export interface Modules {
  economy: EconomyModule
  shop: ShopModule
  scheduler: SchedulerModule
  analytics?: AnalyticsModule
  queryEngine: QueryEngineModule
  personalityEngine?: PersonalityEngineModule
}
