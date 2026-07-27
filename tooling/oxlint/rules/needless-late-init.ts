// clippy::needless_late_init — variable declared without init then immediately assigned
// Detects: let x; x = expr; → const x = expr;
// Also: let x; if (c) { x = a; } else { x = b; } → const x = c ? a : b;

import type { Context, Node } from '../types.ts'

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length - 1; i++) {
    const decl = body[i]!
    const next = body[i + 1]!

    if (decl.type !== 'VariableDeclaration' || decl.declarations.length !== 1) continue
    const d = decl.declarations[0]!
    if (d.id?.type !== 'Identifier' || d.init !== null) continue
    const varName = d.id.name

    // Case 1: let x; x = expr;
    if (
      next.type === 'ExpressionStatement' &&
      next.expression?.type === 'AssignmentExpression' &&
      next.expression.operator === '=' &&
      next.expression.left?.type === 'Identifier' &&
      next.expression.left.name === varName
    ) {
      context.report({
        message: `Needless late init: \`${varName}\` is declared then immediately assigned. Initialize on declaration with \`const\`. (clippy::needless_late_init)`,
        node: decl
      })
    }
  }
}

export default {
  create(context: Context) {
    return {
      BlockStatement(node: Node) {
        if (node.body) checkBody(node.body, context)
      },
      Program(node: Node) {
        if (node.body) checkBody(node.body, context)
      }
    }
  }
}
