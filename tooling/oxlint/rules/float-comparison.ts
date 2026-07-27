// clippy::float_cmp — direct equality comparison of floating-point numbers
// Detects: x === 0.1 + 0.2, a === b where both are floats
// In JS, 0.1 + 0.2 !== 0.3 due to IEEE 754 precision.
// Only flags comparisons where at least one side is a float literal or float arithmetic.

import type { Context, Node } from '../types.ts'

function isFloatLiteral(node: Node): boolean {
  return node.type === 'Literal' && typeof node.value === 'number' && !Number.isInteger(node.value)
}

function isArithmetic(node: Node): boolean {
  return (
    node.type === 'BinaryExpression' &&
    (node.operator === '+' ||
      node.operator === '-' ||
      node.operator === '*' ||
      node.operator === '/')
  )
}

function involvesFloat(node: Node): boolean {
  if (isFloatLiteral(node)) return true
  if (isArithmetic(node)) {
    return involvesFloat(node.left) || involvesFloat(node.right)
  }
  return false
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (
          node.operator !== '===' &&
          node.operator !== '==' &&
          node.operator !== '!==' &&
          node.operator !== '!='
        )
          return

        if (involvesFloat(node.left) || involvesFloat(node.right)) {
          context.report({
            message:
              'Float comparison: direct equality comparison of floating-point numbers is unreliable. Use `Math.abs(a - b) < Number.EPSILON` instead. (clippy::float_cmp)',
            node
          })
        }
      }
    }
  }
}
