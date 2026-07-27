// clippy::unreadable_literal — large numeric literals without digit separators
// Detects: 1000000 → 1_000_000, 0xFF00FF → 0xFF_00_FF
// Threshold: integers >= 10_000, floats >= 100_000

import type { Context, Node } from '../types.ts'

const INT_THRESHOLD = 10_000

export default {
  create(context: Context) {
    return {
      Literal(node: Node) {
        if (typeof node.value !== 'number') return
        if (!Number.isFinite(node.value)) return

        const raw: string | undefined = node.raw
        if (!raw) return

        // Skip if already has underscores
        if (raw.includes('_')) return

        // Skip hex/octal/binary (different grouping rules)
        if (
          raw.startsWith('0x') ||
          raw.startsWith('0o') ||
          raw.startsWith('0b') ||
          raw.startsWith('0X') ||
          raw.startsWith('0O') ||
          raw.startsWith('0B')
        )
          return

        // Skip floats with decimal points (e.g. 3.14)
        if (raw.includes('.')) return

        // Skip scientific notation
        if (raw.includes('e') || raw.includes('E')) return

        const absVal = Math.abs(node.value)
        if (absVal >= INT_THRESHOLD && Number.isInteger(absVal)) {
          context.report({
            message: `Unreadable literal: \`${raw}\` is hard to read. Use numeric separators: \`${formatWithSeparators(raw)}\`. (clippy::unreadable_literal)`,
            node
          })
        }
      }
    }
  }
}

function formatWithSeparators(raw: string): string {
  const negative = raw.startsWith('-')
  const digits = negative ? raw.slice(1) : raw
  const parts: string[] = []
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i))
  }
  return (negative ? '-' : '') + parts.join('_')
}
