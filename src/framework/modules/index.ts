import type { AIModule } from './ai'
import type { Analytics } from './analytics'
import type { EconomyModule } from './economy'
import type { LucidaModule } from './lucida'
import type { SchedulerModule } from './scheduler'
import type { ShopModule } from './shop'

export * from './shop'
export * from './economy'
export * from './scheduler'
export * from './analytics'
export * from './lucida'
export * from './ai'

export interface Modules {
  economy: EconomyModule
  shop: ShopModule
  scheduler: SchedulerModule
  analytics: Analytics
  lucida: LucidaModule
  ai: AIModule
}
