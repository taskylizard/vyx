import { expect, test } from 'vite-plus/test'
import { formatCompact } from '../../src/shared/numbers.ts'

test('keeps small integers and sub-1000 values readable', () => {
  expect(formatCompact(0)).toBe('0')
  expect(formatCompact(7)).toBe('7')
  expect(formatCompact(999)).toBe('999')
  expect(formatCompact(1234)).toBe('1.2k')
})

test('adds one decimal for non-integers below 1000', () => {
  expect(formatCompact(12.5)).toBe('12.5')
  expect(formatCompact(-3.25)).toBe('-3.3')
})

test('scales thousands, millions, billions, and trillions', () => {
  expect(formatCompact(1250)).toBe('1.3k')
  expect(formatCompact(12_500)).toBe('12.5k')
  expect(formatCompact(55_172_425)).toBe('55.2M')
  expect(formatCompact(-340_000_000)).toBe('-340M')
  expect(formatCompact(1_234_567_890)).toBe('1.2B')
  expect(formatCompact(2_000_000_000_000)).toBe('2T')
})

test('drops decimals once the scaled value reaches triple digits', () => {
  expect(formatCompact(111_672_425)).toBe('112M')
  expect(formatCompact(150_000)).toBe('150k')
})
