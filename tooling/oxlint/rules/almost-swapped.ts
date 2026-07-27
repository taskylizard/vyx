// clippy::almost_swapped — broken swap: a = b; b = a; (original a is lost)
// Detects: consecutive assignments that look like a swap but forgot the temp variable.

import type { Context, Node } from '../types.ts'

function assignTarget(node: Node): string | null {
  if (node.type !== 'ExpressionStatement') return null
  const expr = node.expression
  if (expr.type !== 'AssignmentExpression' || expr.operator !== '=') return null
  if (expr.left.type === 'Identifier') return expr.left.name
  return null
}

function assignSource(node: Node): string | null {
  if (node.type !== 'ExpressionStatement') return null
  const expr = node.expression
  if (expr.type !== 'AssignmentExpression' || expr.operator !== '=') return null
  if (expr.right.type === 'Identifier') return expr.right.name
  return null
}

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length - 1; i++) {
    const s1 = body[i]!
    const s2 = body[i + 1]!

    const firstTarget = assignTarget(s1)
    const firstSource = assignSource(s1)
    const secondTarget = assignTarget(s2)
    const secondSource = assignSource(s2)

    if (
      firstTarget &&
      firstSource &&
      secondTarget &&
      secondSource &&
      firstTarget === secondSource &&
      secondTarget === firstSource &&
      firstTarget !== secondTarget
    ) {
      context.report({
        message: `Almost swapped: \`${firstTarget} = ${firstSource}; ${secondTarget} = ${secondSource};\` overwrites \`${firstTarget}\` before saving it. Use \`[${firstTarget}, ${secondTarget}] = [${secondTarget}, ${firstTarget}]\`. (clippy::almost_swapped)`,
        node: s1
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
