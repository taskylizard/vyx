// clippy::manual_swap — three-statement swap pattern
// Detects: const tmp = a; a = b; b = tmp; → [a, b] = [b, a]

import type { Context, Node } from '../types.ts'

function exprName(node: Node): string | null {
  if (node.type === 'Identifier') return node.name
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object?.type === 'Identifier' &&
    node.property?.type === 'Identifier'
  ) {
    return `${node.object.name}.${node.property.name}`
  }
  return null
}

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length - 2; i++) {
    const s1 = body[i]!
    const s2 = body[i + 1]!
    const s3 = body[i + 2]!

    // s1: const tmp = a;
    if (s1.type !== 'VariableDeclaration' || s1.declarations.length !== 1) continue
    const decl = s1.declarations[0]!
    if (decl.id?.type !== 'Identifier' || !decl.init) continue
    const tmpName = decl.id.name
    const firstName = exprName(decl.init)
    if (!firstName) continue

    // s2: a = b;
    if (
      s2.type !== 'ExpressionStatement' ||
      s2.expression?.type !== 'AssignmentExpression' ||
      s2.expression.operator !== '='
    )
      continue
    const s2Left = exprName(s2.expression.left)
    const secondName = exprName(s2.expression.right)
    if (s2Left !== firstName || !secondName) continue

    // s3: b = tmp;
    if (
      s3.type !== 'ExpressionStatement' ||
      s3.expression?.type !== 'AssignmentExpression' ||
      s3.expression.operator !== '='
    )
      continue
    const thirdLeft = exprName(s3.expression.left)
    const thirdRight = exprName(s3.expression.right)
    if (thirdLeft !== secondName || thirdRight !== tmpName) continue

    context.report({
      message: `Manual swap: use destructuring \`[${firstName}, ${secondName}] = [${secondName}, ${firstName}]\` instead of a temp variable. (clippy::manual_swap)`,
      node: s1
    })
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
