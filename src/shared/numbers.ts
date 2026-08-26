const COMPACT_UNITS = ['', 'k', 'M', 'B', 'T'] as const

/**
 * Formats a number with compact magnitude suffixes, e.g. 12500 -> "12.5k",
 * 340000000 -> "340M". Integers below 1000 stay untouched.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0'

  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  const unitIndex =
    magnitude < 1000 ? 0 : Math.min(Math.floor(Math.log10(magnitude) / 3), COMPACT_UNITS.length - 1)
  const scaled = magnitude / 1000 ** unitIndex

  return `${sign}${trimTrailingZeros(scaled.toFixed(decimalsFor(unitIndex, magnitude, scaled)))}${
    COMPACT_UNITS[unitIndex]
  }`
}

function decimalsFor(unitIndex: number, magnitude: number, scaled: number): number {
  if (unitIndex > 0 && scaled < 100) return 1
  if (unitIndex === 0 && !Number.isInteger(magnitude)) return 1
  return 0
}

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes('.')) return formatted
  return formatted.replace(/\.?0+$/u, '')
}
