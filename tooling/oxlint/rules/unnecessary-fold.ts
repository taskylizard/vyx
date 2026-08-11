// clippy::unnecessary_fold — .reduce() that could be .some() or .every()
// Detects: arr.reduce((acc, x) => acc || cond(x), false) → arr.some(cond)
// Detects: arr.reduce((acc, x) => acc && cond(x), true) → arr.every(cond)

import type { Context, Node } from '../types.ts'
import { isLiteral, isMethodCall } from '../types.ts'

function extractReduceCallback(callback: Node): { accName: string; bodyExpr: Node } | null {
  if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
    return null
  if (callback.params.length !== 2) return null
  const accParam = callback.params[0]
  if (accParam === undefined || accParam.type !== 'Identifier') return null

  let bodyExpr: Node | null = null
  if (callback.body.type === 'BlockStatement') {
    const stmt = callback.body.body[0]
    if (callback.body.body.length === 1 && stmt !== undefined && stmt.type === 'ReturnStatement') {
      bodyExpr = stmt.argument ?? null
    }
  } else {
    bodyExpr = callback.body
  }
  if (!bodyExpr || bodyExpr.type !== 'LogicalExpression') return null

  return { accName: accParam.name, bodyExpr }
}

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (!isMethodCall(node, 'reduce')) return
        const args = node.arguments
        if (!args || args.length !== 2) return

        const callback = args[0]
        if (callback === undefined) return
        const initial = args[1]
        if (initial === undefined) return

        const extracted = extractReduceCallback(callback)
        if (!extracted) return

        const { accName, bodyExpr } = extracted
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
