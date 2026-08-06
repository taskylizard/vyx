import { bench, describe } from 'vite-plus/test'
import { readNodeRuntimeMetrics } from '../../src/observability/runtime-metrics.ts'

describe('runtime metrics collection overhead', () => {
  bench('baseline process uptime read', () => {
    process.uptime()
  })

  bench('native memory and uptime snapshot', () => {
    readNodeRuntimeMetrics()
  })
})
