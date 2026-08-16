// clippy::manual_find (includes variant) — for loop implementing .includes()
// Detects: for (const x of arr) { if (x === val) return true; } return false;

import type { Context, Node } from '../types.ts'
import { getForOfVar, getFunctionBody, isLiteral, unwrapBlock } from '../types.ts'

function isEqualityCheck(test: Node, varName: string): boolean {
  if (test.type !== 'BinaryExpression') return false
  if (test.operator !== '===' && test.operator !== '==') return false

  const left = test.left
  const right = test.right

  return (
    (left.type === 'Identifier' && left.name === varName) ||
    (right.type === 'Identifier' && right.name === varName)
  )
}

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]
    if (stmt.type !== 'ForOfStatement') continue

    const loopVar = getForOfVar(stmt)
    if (!loopVar) continue

    const inner = unwrapBlock(stmt.body)
    if (!inner || inner.type !== 'IfStatement' || inner.alternate) continue

    if (!isEqualityCheck(inner.test, loopVar)) continue

    const consequent = unwrapBlock(inner.consequent)
    if (
      !consequent ||
      consequent.type !== 'ReturnStatement' ||
      !isLiteral(consequent.argument, true)
    )
      continue

    const next = body.at(i + 1)
    if (next && next.type === 'ReturnStatement' && isLiteral(next.argument, false)) {
      context.report({
        message:
          'Manual includes: this loop can be replaced with `.includes()`. (clippy::manual_find)',
        node: stmt
      })
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
