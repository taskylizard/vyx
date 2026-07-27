// clippy::manual_is_finite / manual_is_infinite — manual infinity checks
// Detects: x !== Infinity && x !== -Infinity → Number.isFinite(x)
// Detects: x === Infinity || x === -Infinity → !Number.isFinite(x)

import type { Context, Node } from '../types.ts'

function isInfinityCheck(node: Node, operator: string): boolean {
  if (node.type !== 'BinaryExpression' || node.operator !== operator) return false
  return isInfinityLiteral(node.right) || isInfinityLiteral(node.left)
}

function isInfinityLiteral(node: Node): boolean {
  // Infinity
  if (node.type === 'Identifier' && node.name === 'Infinity') return true
  // -Infinity
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument?.type === 'Identifier' &&
    node.argument.name === 'Infinity'
  )
    return true
  return false
}

export default {
  create(context: Context) {
    return {
      LogicalExpression(node: Node) {
        // x !== Infinity && x !== -Infinity → Number.isFinite(x)
        if (
          node.operator === '&&' &&
          isInfinityCheck(node.left, '!==') &&
          isInfinityCheck(node.right, '!==')
        ) {
          context.report({
            message:
              'Manual isFinite: this pattern checks for finiteness manually. Use `Number.isFinite(x)` instead. (clippy::manual_is_finite)',
            node
          })
        }
        // x === Infinity || x === -Infinity → !Number.isFinite(x)
        if (
          node.operator === '||' &&
          isInfinityCheck(node.left, '===') &&
          isInfinityCheck(node.right, '===')
        ) {
          context.report({
            message:
              'Manual isInfinite: this pattern checks for infinity manually. Use `!Number.isFinite(x)` instead. (clippy::manual_is_infinite)',
            node
          })
        }
      }
    }
  }
}
