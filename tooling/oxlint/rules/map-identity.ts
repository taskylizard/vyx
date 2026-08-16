// clippy::map_identity — .map() with an identity function
// Detects: arr.map(x => x) — a no-op; remove or use .slice() to copy

import type { Context, Node } from '../types.ts'
import { isMethodCall } from '../types.ts'

function isIdentityClosure(node: Node): boolean {
  // (x) => x
  if (node.type === 'ArrowFunctionExpression' && node.params.length === 1) {
    const param = node.params[0]
    const body = node.body
    if (param.type === 'Identifier' && body.type === 'Identifier' && body.name === param.name) {
      return true
    }
    // (x) => { return x; }
    if (body.type === 'BlockStatement' && body.body.length === 1) {
      const stmt = body.body[0]
      if (
        stmt.type === 'ReturnStatement' &&
        stmt.argument?.type === 'Identifier' &&
        stmt.argument.name === param.name
      ) {
        return true
      }
    }
  }
  // function(x) { return x; }
  if (node.type === 'FunctionExpression' && node.params.length === 1) {
    const param = node.params[0]
    if (
      param.type === 'Identifier' &&
      node.body.type === 'BlockStatement' &&
      node.body.body.length === 1
    ) {
      const stmt = node.body.body[0]
      if (
        stmt.type === 'ReturnStatement' &&
        stmt.argument?.type === 'Identifier' &&
        stmt.argument.name === param.name
      ) {
        return true
      }
    }
  }
  return false
}

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (!isMethodCall(node, 'map')) return

        const args = node.arguments
        if (!args || args.length !== 1) return

        if (isIdentityClosure(args[0])) {
          context.report({
            message:
              'Map identity: `.map(x => x)` is a no-op. Remove it, or use `.slice()` / `[...arr]` to copy. (clippy::map_identity)',
            node
          })
        }
      }
    }
  }
}
