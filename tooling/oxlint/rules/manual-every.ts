// clippy::manual_find (every variant) — for loop implementing .every()
// Detects: for (const x of arr) { if (!cond(x)) return false; } return true;
// Also: for (const x of arr) { if (cond(x)) return false; } return true;

import type { Context, Node } from '../types.ts'
import { getFunctionBody, isLiteral, unwrapBlock } from '../types.ts'

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]
    if (stmt.type !== 'ForOfStatement') continue

    const inner = unwrapBlock(stmt.body)
    if (!inner || inner.type !== 'IfStatement' || inner.alternate) continue

    const consequent = unwrapBlock(inner.consequent)
    if (
      !consequent ||
      consequent.type !== 'ReturnStatement' ||
      !isLiteral(consequent.argument, false)
    )
      continue

    const next: Node | undefined = body[i + 1]
    if (next && next.type === 'ReturnStatement' && isLiteral(next.argument, true)) {
      context.report({
        message: 'Manual every: this loop can be replaced with `.every()`. (clippy::manual_find)',
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
