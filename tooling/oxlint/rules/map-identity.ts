// clippy::map_identity — .map() with an identity function
// Detects: arr.map(x => x) — a no-op; remove or use .slice() to copy

import type { Context, Node } from '../types.ts'
import { isMethodCall } from '../types.ts'

function getSingleIdentifierParam(node: Node): string | null {
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return null
  if (node.params.length !== 1) return null
  const param = node.params[0]
  if (param === undefined || param.type !== 'Identifier') return null
  return param.name
}

function bodyReturnsIdentifier(body: Node, name: string): boolean {
  if (body.type === 'Identifier' && body.name === name) return true
  if (body.type === 'BlockStatement' && body.body.length === 1) {
    const stmt = body.body[0]
    if (
      stmt !== undefined &&
      stmt.type === 'ReturnStatement' &&
      stmt.argument?.type === 'Identifier' &&
      stmt.argument.name === name
    ) {
      return true
    }
  }
  return false
}

function isIdentityClosure(node: Node): boolean {
  const paramName = getSingleIdentifierParam(node)
  if (paramName === null) return false
  return bodyReturnsIdentifier(node.body, paramName)
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
