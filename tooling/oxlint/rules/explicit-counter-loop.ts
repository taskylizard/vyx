// clippy::explicit_counter_loop — manual counter variable with for-of
// Detects: let i = 0; for (const x of arr) { ...i...; i++; }
// Suggests: for (const [i, x] of arr.entries())

import type { Context, Node } from '../types.ts'
import { getFunctionBody } from '../types.ts'

function getZeroInitCounter(decl: Node): string | null {
  if (decl.type !== 'VariableDeclaration' || decl.declarations.length !== 1) return null
  const d = decl.declarations[0]
  if (d.id?.type !== 'Identifier' || d.init?.type !== 'Literal' || d.init.value !== 0) return null
  return d.id.name
}

function isCounterIncrement(stmt: Node, counterName: string): boolean {
  if (stmt.type !== 'ExpressionStatement') return false
  const expr = stmt.expression
  if (
    expr?.type === 'UpdateExpression' &&
    expr.operator === '++' &&
    expr.argument?.type === 'Identifier' &&
    expr.argument.name === counterName
  )
    return true
  if (
    expr?.type === 'AssignmentExpression' &&
    expr.operator === '+=' &&
    expr.left?.type === 'Identifier' &&
    expr.left.name === counterName &&
    expr.right?.type === 'Literal' &&
    expr.right.value === 1
  )
    return true
  return false
}

function checkBody(body: Node[], context: Context) {
  for (let i = 0; i < body.length - 1; i++) {
    const counterName = getZeroInitCounter(body[i])
    if (!counterName) continue

    const loop = body[i + 1]
    if (loop.type !== 'ForOfStatement') continue
    if (loop.body?.type !== 'BlockStatement' || loop.body.body.length === 0) continue

    const stmts: Node[] = loop.body.body
    if (isCounterIncrement(stmts[stmts.length - 1], counterName)) {
      context.report({
        message: `Explicit counter loop: manual counter \`${counterName}\` can be replaced with \`for (const [${counterName}, item] of arr.entries())\`. (clippy::explicit_counter_loop)`,
        node: loop
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
      ArrowFunctionExpression: checkFunction,
      Program(node: Node) {
        if (node.body) checkBody(node.body, context)
      }
    }
  }
}
