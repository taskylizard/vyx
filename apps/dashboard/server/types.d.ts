import { ConsolaInstance } from "consola";
import type { Client } from "../../src/framework";

declare module "h3" {
  interface H3EventContext {
    bot: Client;
    logger: ConsolaInstance;
  }
}