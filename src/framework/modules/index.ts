import type { AIModule } from './ai'
import type { Analytics } from './analytics'
import type { EconomyModule } from './economy'
import type { SchedulerModule } from './scheduler'
import type { ShopModule } from './shop'

export * from './shop'
export * from './economy'
export * from './scheduler'
export * from './analytics'
export * from './ai'

export interface Modules {
  economy: EconomyModule
  shop: ShopModule
  scheduler: SchedulerModule
  analytics: Analytics
  ai: AIModule
}
