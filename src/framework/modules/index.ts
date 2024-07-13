import type { Analytics } from './analytics';
import type { CasesModule } from './cases';
import type { EconomyModule } from './economy';
import type { SchedulerModule } from './scheduler';
import type { ShopModule } from './shop';

export * from './shop';
export * from './economy';
export * from './cases';
export * from './scheduler';
export * from './analytics';

export interface Modules {
  economy: EconomyModule;
  shop: ShopModule;
  cases: CasesModule;
  scheduler: SchedulerModule;
  analytics: Analytics;
}
