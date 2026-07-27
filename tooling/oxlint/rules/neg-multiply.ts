// clippy::neg_multiply — multiplication by -1 instead of negation
// Detects: x * -1 → -x, -1 * x → -x

import type { Context, Node } from '../types.ts'

function isNegOne(node: Node): boolean {
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'Literal' &&
    node.argument.value === 1
  ) {
    return true
  }
  // Also handle literal -1 (some parsers represent it as Literal with value -1)
  if (node.type === 'Literal' && node.value === -1) return true
  return false
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (node.operator !== '*') return

        if (isNegOne(node.left) || isNegOne(node.right)) {
          context.report({
            message:
              'Neg multiply: multiplying by -1 is less readable than negation. Use `-x` instead of `x * -1`. (clippy::neg_multiply)',
            node
          })
        }
      }
    }
  }
}
