import type { Mapping } from '../revolt/bridge/types';

export class BridgeModule {
  public mappings: Mapping[];
  constructor() {
    this.mappings = [];
  }
}
