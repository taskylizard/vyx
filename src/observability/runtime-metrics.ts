import type { BatchObservableResult, Meter } from '@opentelemetry/api'
import { METRIC_PROCESS_UPTIME } from '@opentelemetry/semantic-conventions/incubating'

export const METRIC_NODEJS_MEMORY_ARRAY_BUFFERS = 'process.runtime.nodejs.memory.array_buffers'
export const METRIC_NODEJS_MEMORY_EXTERNAL = 'process.runtime.nodejs.memory.external'

export function readNodeRuntimeMetrics() {
  const { arrayBuffers, external } = process.memoryUsage()
  return {
    arrayBuffers,
    external,
    uptime: process.uptime()
  }
}

export function registerNodeRuntimeMetrics(meter: Meter): () => void {
  const arrayBufferMemory = meter.createObservableGauge(METRIC_NODEJS_MEMORY_ARRAY_BUFFERS, {
    description: 'Memory allocated for Node.js ArrayBuffer and SharedArrayBuffer values.',
    unit: 'By'
  })
  const externalMemory = meter.createObservableGauge(METRIC_NODEJS_MEMORY_EXTERNAL, {
    description: 'Memory used by C++ objects bound to JavaScript objects managed by V8.',
    unit: 'By'
  })
  const uptime = meter.createObservableGauge(METRIC_PROCESS_UPTIME, {
    description: 'Seconds the Node.js process has been running.',
    unit: 's'
  })
  const observables = [arrayBufferMemory, externalMemory, uptime]
  const collect = (result: BatchObservableResult) => {
    const snapshot = readNodeRuntimeMetrics()
    result.observe(arrayBufferMemory, snapshot.arrayBuffers)
    result.observe(externalMemory, snapshot.external)
    result.observe(uptime, snapshot.uptime)
  }

  meter.addBatchObservableCallback(collect, observables)
  return () => meter.removeBatchObservableCallback(collect, observables)
}
