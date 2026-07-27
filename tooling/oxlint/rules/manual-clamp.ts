// clippy::manual_clamp — manual min/max clamping patterns
// Detects: Math.max(min, Math.min(val, max)) or Math.min(max, Math.max(val, min))
// Suggests: use a clamp function or Math.min(Math.max(val, min), max) with a comment

import type { Context, Node } from '../types.ts'
import { isIdentifier } from '../types.ts'

function isMathCall(node: Node, method: string): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  return (
    callee.type === 'MemberExpression' &&
    isIdentifier(callee.object, 'Math') &&
    isIdentifier(callee.property, method)
  )
}

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        const args = node.arguments
        if (!args || args.length !== 2) return

        // Math.max(min, Math.min(val, max))
        if (isMathCall(node, 'max') && isMathCall(args[0], 'min')) {
          context.report({
            message:
              'Manual clamp: this `Math.max(min, Math.min(val, max))` pattern is a clamp. Consider extracting a `clamp(val, min, max)` helper. (clippy::manual_clamp)',
            node
          })
          return
        }
        if (isMathCall(node, 'max') && isMathCall(args[1], 'min')) {
          context.report({
            message:
              'Manual clamp: this `Math.max(Math.min(val, max), min)` pattern is a clamp. Consider extracting a `clamp(val, min, max)` helper. (clippy::manual_clamp)',
            node
          })
          return
        }

        // Math.min(max, Math.max(val, min))
        if (isMathCall(node, 'min') && isMathCall(args[0], 'max')) {
          context.report({
            message:
              'Manual clamp: this `Math.min(max, Math.max(val, min))` pattern is a clamp. Consider extracting a `clamp(val, min, max)` helper. (clippy::manual_clamp)',
            node
          })
          return
        }
        if (isMathCall(node, 'min') && isMathCall(args[1], 'max')) {
          context.report({
            message:
              'Manual clamp: this `Math.min(Math.max(val, min), max)` pattern is a clamp. Consider extracting a `clamp(val, min, max)` helper. (clippy::manual_clamp)',
            node
          })
          return
        }
      }
    }
  }
}
