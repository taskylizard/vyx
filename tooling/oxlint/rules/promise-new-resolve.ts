// clippy principle: "avoid error-prone constructors"
// Detects: new Promise((resolve) => resolve(x)) → Promise.resolve(x)
// Detects: new Promise((_, reject) => reject(x)) → Promise.reject(x)
// The Promise constructor is needed for async operations, not for wrapping sync values.

import type { Context, Node } from '../types.ts'
import { isIdentifier } from '../types.ts'

export default {
  create(context: Context) {
    return {
      NewExpression(node: Node) {
        if (!isIdentifier(node.callee, 'Promise')) return
        if (!node.arguments || node.arguments.length !== 1) return

        const callback = node.arguments[0]
        if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
          return
        if (callback.params.length < 1) return

        const resolveParam = callback.params[0]
        const rejectParam = callback.params[1]

        let bodyExpr: Node | null = null
        if (callback.body.type === 'BlockStatement' && callback.body.body.length === 1) {
          const stmt = callback.body.body[0]
          if (stmt.type === 'ExpressionStatement') bodyExpr = stmt.expression
        } else if (callback.body.type !== 'BlockStatement') {
          bodyExpr = callback.body
        }

        if (!bodyExpr || bodyExpr.type !== 'CallExpression') return
        if (bodyExpr.arguments.length > 1) return

        const calledFn = bodyExpr.callee
        if (calledFn.type !== 'Identifier') return

        // new Promise((resolve) => resolve(x)) → Promise.resolve(x)
        if (resolveParam.type === 'Identifier' && calledFn.name === resolveParam.name) {
          context.report({
            message:
              'Promise constructor wrapping sync value: `new Promise(resolve => resolve(x))` can be simplified to `Promise.resolve(x)`. (clippy: avoid error-prone constructors)',
            node
          })
          return
        }

        // new Promise((_, reject) => reject(x)) → Promise.reject(x)
        if (rejectParam?.type === 'Identifier' && calledFn.name === rejectParam.name) {
          context.report({
            message:
              'Promise constructor wrapping sync rejection: `new Promise((_, reject) => reject(x))` can be simplified to `Promise.reject(x)`. (clippy: avoid error-prone constructors)',
            node
          })
        }
      }
    }
  }
}
