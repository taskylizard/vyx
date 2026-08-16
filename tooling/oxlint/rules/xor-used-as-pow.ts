// clippy::suspicious_xor_used_as_pow — XOR operator mistaken for exponentiation
// Detects: 2 ^ 8 (likely meant 2 ** 8 = 256, but ^ is XOR = 10)
// Only flags when both sides are integer literals and the result looks like
// the user intended exponentiation.

import type { Context, Node } from '../types.ts'

function isIntLiteral(node: Node): node is Node & { value: number } {
  return node.type === 'Literal' && typeof node.value === 'number' && Number.isInteger(node.value)
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (node.operator !== '^') return

        // Only flag when both sides are integer literals (strong signal of mistake)
        if (!isIntLiteral(node.left) || !isIntLiteral(node.right)) return

        const base = node.left.value
        const exp = node.right.value

        // Common exponentiation patterns: 2^N, 10^N, small^small
        if (base >= 2 && exp >= 2) {
          context.report({
            message: `XOR used as pow: \`${base} ^ ${exp}\` is bitwise XOR (= ${base ^ exp}), not exponentiation. Use \`${base} ** ${exp}\` (= ${base ** exp}) or \`Math.pow(${base}, ${exp})\` instead. (clippy::suspicious_xor_used_as_pow)`,
            node
          })
        }
      }
    }
  }
}
