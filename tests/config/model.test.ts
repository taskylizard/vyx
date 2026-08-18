import { afterEach, expect, test, vi } from 'vite-plus/test'
import {
  KANIKOU_MODEL_FALLBACK,
  KANIKOU_MODEL_PRE_CUTOFF,
  getKanikouModel
} from '../../src/config/model.ts'

afterEach(() => {
  vi.useRealTimers()
})

test('uses the preferred model before the August 27 cutoff', () => {
  vi.useFakeTimers({ now: new Date('2026-08-18T12:00:00.000Z') })

  expect(getKanikouModel()).toBe(KANIKOU_MODEL_PRE_CUTOFF)
})

test('uses the preferred model on the last day of the cutoff (August 27)', () => {
  vi.useFakeTimers({ now: new Date('2026-08-27T23:59:59.999Z') })

  expect(getKanikouModel()).toBe(KANIKOU_MODEL_PRE_CUTOFF)
})

test('falls back to the fallback model on and after August 28', () => {
  vi.useFakeTimers({ now: new Date('2026-08-28T00:00:00.000Z') })

  expect(getKanikouModel()).toBe(KANIKOU_MODEL_FALLBACK)
})

test('falls back again well past the cutoff', () => {
  vi.useFakeTimers({ now: new Date('2026-12-31T23:59:59.999Z') })

  expect(getKanikouModel()).toBe(KANIKOU_MODEL_FALLBACK)
})

test('checks the live date on every call without caching', () => {
  vi.useFakeTimers({ now: new Date('2026-08-18T00:00:00.000Z') })
  expect(getKanikouModel()).toBe(KANIKOU_MODEL_PRE_CUTOFF)

  vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'))
  expect(getKanikouModel()).toBe(KANIKOU_MODEL_FALLBACK)

  vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'))
  expect(getKanikouModel()).toBe(KANIKOU_MODEL_PRE_CUTOFF)
})
