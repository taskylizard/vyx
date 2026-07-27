// clippy::float_equality_without_abs — float comparison without Math.abs()
// Detects: (a - b) < EPSILON (missing abs — fails when a < b)

import type { Context, Node } from '../types.ts'

function isEpsilonLike(node: Node): boolean {
  // Number.EPSILON
  if (
    node.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'Number' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'EPSILON'
  )
    return true
  // Small float literal
  if (node.type === 'Literal' && typeof node.value === 'number' && node.value > 0 && node.value < 1)
    return true
  return false
}

function isSubtraction(node: Node): boolean {
  return node.type === 'BinaryExpression' && node.operator === '-'
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        if (node.operator !== '<' && node.operator !== '<=') return

        // (a - b) < epsilon
        if (isSubtraction(node.left) && isEpsilonLike(node.right)) {
          context.report({
            message:
              'Float equality without abs: `(a - b) < epsilon` fails when a < b. Use `Math.abs(a - b) < epsilon`. (clippy::float_equality_without_abs)',
            node
          })
        }
      }
    }
  }
}
