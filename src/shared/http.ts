import { Agent, setGlobalDispatcher } from 'undici'

/**
 * Shared HTTP connection pool for all outbound `fetch` calls.
 *
 * Configures a single undici `Agent` with keep-alive, per-origin connection
 * limits, and backstop timeouts, then installs it as the global dispatcher so
 * every `globalThis.fetch` call — jumble enrichment, autoembed scraping,
 * Project Selene GitHub requests, media downloads — reuses the same pool.
 */
const sharedAgent = new Agent({
  connections: 64,
  keepAliveTimeout: 15_000,
  keepAliveMaxTimeout: 30_000,
  connectTimeout: 10_000,
  headersTimeout: 30_000,
  bodyTimeout: 120_000
})

setGlobalDispatcher(sharedAgent)

export { sharedAgent }
