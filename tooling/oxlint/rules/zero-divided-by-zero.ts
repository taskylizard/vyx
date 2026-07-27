// clippy::zero_divided_by_zero — 0 / 0 produces NaN; use NaN directly
// Also catches 0.0 / 0.0

import type { Context, Node } from '../types.ts'

function isZero(node: Node): boolean {
  return node.type === 'Literal' && (node.value === 0 || node.value === 0.0)
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (node.operator === '/' && isZero(node.left) && isZero(node.right)) {
          context.report({
            message:
              'Zero divided by zero: `0 / 0` is `NaN`. Use `NaN` directly if intentional. (clippy::zero_divided_by_zero)',
            node
          })
        }
      }
    }
  }
}
