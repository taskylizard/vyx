// oxlint-disable-next-line import/no-unassigned-import
import './shared/http.ts'
import { loadKanikouEnv } from './config/env.ts'
import { startKanikouObservability } from './observability/axiom.ts'

const config = loadKanikouEnv()
const observability = startKanikouObservability(config.observability)
const { startKanikouBot } = await import('./bot/app.ts')
const app = await startKanikouBot(config, observability).catch(async (error: unknown) => {
  observability.logger.error('kanikou startup failed', { error })
  await observability.shutdown()
  throw error
})
let stopping = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return
    stopping = true
    void app.stop().finally(() => process.kill(process.pid, signal))
  })
}
