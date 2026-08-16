// clippy::unnecessary_fold — .reduce() that could be .some() or .every()
// Detects: arr.reduce((acc, x) => acc || cond(x), false) → arr.some(cond)
// Detects: arr.reduce((acc, x) => acc && cond(x), true) → arr.every(cond)

import type { Context, Node } from '../types.ts'
import { isLiteral, isMethodCall } from '../types.ts'

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (!isMethodCall(node, 'reduce')) return
        const args = node.arguments
        if (!args || args.length !== 2) return

        const callback = args[0]
        const initial = args[1]

        // Callback must be (acc, x) => acc OP expr
        if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
          return
        if (callback.params.length !== 2) return
        const accParam = callback.params[0]
        if (accParam.type !== 'Identifier') return
        const accName = accParam.name

        // Get the body expression
        let bodyExpr: Node | null = null
        if (callback.body.type === 'BlockStatement') {
          if (callback.body.body.length === 1) {
            const statement = callback.body.body[0]
            if (statement.type === 'ReturnStatement') bodyExpr = statement.argument
          }
        } else {
          bodyExpr = callback.body
        }
        if (!bodyExpr || bodyExpr.type !== 'LogicalExpression') return

        const isAccLeft = bodyExpr.left.type === 'Identifier' && bodyExpr.left.name === accName

        // acc || expr with initial false → .some()
        if (bodyExpr.operator === '||' && isLiteral(initial, false) && isAccLeft) {
          context.report({
            message:
              'Unnecessary fold: this `.reduce()` with `||` and initial `false` can be replaced with `.some()`. (clippy::unnecessary_fold)',
            node
          })
        }

        // acc && expr with initial true → .every()
        if (bodyExpr.operator === '&&' && isLiteral(initial, true) && isAccLeft) {
          context.report({
            message:
              'Unnecessary fold: this `.reduce()` with `&&` and initial `true` can be replaced with `.every()`. (clippy::unnecessary_fold)',
            node
          })
        }
      }
    }
  }
}
