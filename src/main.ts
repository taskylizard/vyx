import { startKanikouBot } from './index.ts'

const app = await startKanikouBot()
let stopping = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return
    stopping = true
    void app.stop().finally(() => process.kill(process.pid, signal))
  })
}
