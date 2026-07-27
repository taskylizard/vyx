// clippy::bool_comparison — explicit comparison to boolean literals
// Detects: x === true → x, x === false → !x, x !== true → !x, x !== false → x
// NOT covered by oxlint's built-in rules (no-unnecessary-boolean-literal-compare is not in oxlint)

import type { Context, Node } from '../types.ts'
import { isBoolLiteral } from '../types.ts'

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (node.operator !== '===' && node.operator !== '!==') return

        const leftBool = isBoolLiteral(node.left)
        const rightBool = isBoolLiteral(node.right)

        if (!leftBool && !rightBool) return
        // Skip if both sides are bool literals (that's a different issue)
        if (leftBool && rightBool) return

        const boolVal = leftBool ? node.left.value : node.right.value
        const isEqual = node.operator === '==='

        let suggestion: string
        if ((boolVal && isEqual) || (!boolVal && !isEqual)) {
          suggestion = 'use the expression directly'
        } else {
          suggestion = 'negate the expression with `!`'
        }

        context.report({
          message: `Bool comparison: comparison to \`${boolVal}\` is needless. Instead, ${suggestion}. (clippy::bool_comparison)`,
          node
        })
      }
    }
  }
}
