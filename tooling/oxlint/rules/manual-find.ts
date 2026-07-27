// clippy::manual_find — for loop that can be replaced with .find()
// Detects: for (const x of arr) { if (cond(x)) return x; } return undefined;

import type { Context, Node } from '../types.ts'
import { getForOfVar, getFunctionBody, unwrapBlock } from '../types.ts'

function isReturnOfVar(stmt: Node, varName: string): boolean {
  if (stmt.type !== 'ReturnStatement') return false
  return stmt.argument?.type === 'Identifier' && stmt.argument.name === varName
}

function isReturnNullish(stmt: Node): boolean {
  if (stmt.type !== 'ReturnStatement') return false
  if (!stmt.argument) return true // bare return
  if (stmt.argument.type === 'Identifier' && stmt.argument.name === 'undefined') return true
  if (stmt.argument.type === 'Literal' && stmt.argument.value === null) return true
  return false
}

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]!
    if (stmt.type !== 'ForOfStatement') continue

    const loopVar = getForOfVar(stmt)
    if (!loopVar) continue

    const inner = unwrapBlock(stmt.body)
    if (!inner) continue

    if (inner.type === 'IfStatement' && !inner.alternate) {
      const consequent = unwrapBlock(inner.consequent)
      if (consequent && isReturnOfVar(consequent, loopVar)) {
        const next: Node | undefined = body[i + 1]
        if (next && isReturnNullish(next)) {
          context.report({
            message: 'Manual find: this loop can be replaced with `.find()`. (clippy::manual_find)',
            node: stmt
          })
        }
      }
    }
  }
}

export default {
  create(context: Context) {
    function checkFunction(node: Node) {
      const body = getFunctionBody(node)
      if (body) checkBody(body, context)
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction
    }
  }
}
