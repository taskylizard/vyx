// clippy::let_and_return — unnecessary variable before return
// Detects: const x = expr; return x; → return expr;
// Only flags when the variable is declared and immediately returned with no other uses.

import type { Context, Node } from '../types.ts'
import { getFunctionBody } from '../types.ts'

function checkBody(body: Node[], context: Context) {
  if (body.length < 2) return

  const last = body[body.length - 1]
  const secondLast = body[body.length - 2]

  // Last must be: return x;
  if (last.type !== 'ReturnStatement' || !last.argument || last.argument.type !== 'Identifier')
    return
  const returnedName = last.argument.name

  // Second-to-last must be: const/let x = expr;
  if (secondLast.type !== 'VariableDeclaration' || secondLast.declarations.length !== 1) return
  const decl = secondLast.declarations[0]!
  if (decl.id?.type !== 'Identifier' || decl.id.name !== returnedName || !decl.init) return

  context.report({
    message: `Let and return: \`${returnedName}\` is immediately returned. Return the expression directly. (clippy::let_and_return)`,
    node: secondLast
  })
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
