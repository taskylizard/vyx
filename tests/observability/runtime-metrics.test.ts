import { expect, test } from 'vite-plus/test'
import { readNodeRuntimeMetrics } from '../../src/observability/runtime-metrics.ts'

test('reads bounded Node.js native-memory and uptime measurements', () => {
  const snapshot = readNodeRuntimeMetrics()

  expect(Number.isFinite(snapshot.arrayBuffers)).toBe(true)
  expect(Number.isFinite(snapshot.external)).toBe(true)
  expect(Number.isFinite(snapshot.uptime)).toBe(true)
  expect(snapshot.arrayBuffers).toBeGreaterThanOrEqual(0)
  expect(snapshot.external).toBeGreaterThanOrEqual(snapshot.arrayBuffers)
  expect(snapshot.uptime).toBeGreaterThanOrEqual(0)
})
