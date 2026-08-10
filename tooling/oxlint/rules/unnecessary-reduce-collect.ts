// clippy principle: "prefer combinators" — .reduce() that builds an array is really .map() or .filter()
//
// Detects: arr.reduce((acc, x) => { acc.push(f(x)); return acc; }, []) → arr.map(f)
// Detects: arr.reduce((acc, x) => { if (c(x)) acc.push(x); return acc; }, []) → arr.filter(c)
// Detects: arr.reduce((acc, x) => { acc.push(...f(x)); return acc; }, []) → arr.flatMap(f)

import type { Context, Node } from '../types.ts'
import { isMethodCall } from '../types.ts'

function isEmptyArray(node: Node): boolean {
  return node.type === 'ArrayExpression' && (!node.elements || node.elements.length === 0)
}

function isAccPush(stmt: Node, accName: string): boolean {
  return (
    stmt.type === 'ExpressionStatement' &&
    stmt.expression?.type === 'CallExpression' &&
    stmt.expression.callee?.type === 'MemberExpression' &&
    stmt.expression.callee.object?.type === 'Identifier' &&
    stmt.expression.callee.object.name === accName &&
    stmt.expression.callee.property?.type === 'Identifier' &&
    stmt.expression.callee.property.name === 'push'
  )
}

function returnsAcc(stmt: Node, accName: string): boolean {
  return (
    stmt.type === 'ReturnStatement' &&
    stmt.argument?.type === 'Identifier' &&
    stmt.argument.name === accName
  )
}

function getReduceBody(callback: Node): { stmts: Node[]; accName: string } | null {
  if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
    return null
  if (callback.params.length !== 2) return null
  const accParam = callback.params[0]!
  if (accParam.type !== 'Identifier') return null
  if (callback.body.type !== 'BlockStatement') return null
  return { stmts: callback.body.body, accName: accParam.name }
}

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (!isMethodCall(node, 'reduce')) return
        const args = node.arguments
        if (!args || args.length !== 2) return
        if (!isEmptyArray(args[1])) return

        const body = getReduceBody(args[0])
        if (!body || body.stmts.length !== 2) return

        const [firstStmt, returnStmt] = body.stmts
        if (!returnsAcc(returnStmt, body.accName)) return

        // Pattern: { acc.push(expr); return acc; } → .map()
        if (isAccPush(firstStmt, body.accName) && firstStmt.expression.arguments?.length === 1) {
          context.report({
            message:
              'Unnecessary reduce: this `.reduce()` builds an array with `.push()`. Use `.map()` instead. (clippy: prefer combinators)',
            node
          })
          return
        }

        // Pattern: { if (cond) acc.push(x); return acc; } → .filter()
        if (firstStmt.type === 'IfStatement' && !firstStmt.alternate) {
          const consequent = firstStmt.consequent
          let pushExpr: Node | null = null
          if (consequent.type === 'BlockStatement' && consequent.body.length === 1) {
            pushExpr = consequent.body[0]!
          } else if (consequent.type === 'ExpressionStatement') {
            pushExpr = consequent
          }

          if (pushExpr && isAccPush(pushExpr, body.accName)) {
            context.report({
              message:
                'Unnecessary reduce: this `.reduce()` conditionally pushes items. Use `.filter()` instead. (clippy: prefer combinators)',
              node
            })
          }
        }
      }
    }
  }
}
