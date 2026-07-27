// clippy::needless_bool — if/else returning boolean literals
// Detects: if (c) { return true } else { return false } → return c
// Detects: if (c) { x = true } else { x = false } → x = c
// NOT covered by eslint/no-unneeded-ternary (which only catches ternaries)

import type { Context, Node } from '../types.ts'
import { isBoolLiteral, unwrapBlock } from '../types.ts'

function checkBoolReturn(consequent: Node, alternate: Node, node: Node, context: Context): boolean {
  if (consequent.type !== 'ReturnStatement' || alternate.type !== 'ReturnStatement') return false
  const thenArg = consequent.argument
  const elseArg = alternate.argument
  if (isBoolLiteral(thenArg) && isBoolLiteral(elseArg) && thenArg.value !== elseArg.value) {
    const suggestion = thenArg.value ? 'return <condition>' : 'return !<condition>'
    context.report({
      message: `Needless bool: this if/else returns opposing booleans. Simplify to \`${suggestion}\`. (clippy::needless_bool)`,
      node
    })
  }
  return true
}

function isBoolAssign(
  stmt: Node
): stmt is Node & { expression: { left: Node; right: Node; operator: string } } {
  return (
    stmt.type === 'ExpressionStatement' &&
    stmt.expression.type === 'AssignmentExpression' &&
    stmt.expression.operator === '='
  )
}

function checkBoolAssign(consequent: Node, alternate: Node, node: Node, context: Context) {
  if (!isBoolAssign(consequent) || !isBoolAssign(alternate)) return
  const thenExpr = consequent.expression
  const elseExpr = alternate.expression

  if (
    thenExpr.left.type === 'Identifier' &&
    elseExpr.left.type === 'Identifier' &&
    thenExpr.left.name === elseExpr.left.name &&
    isBoolLiteral(thenExpr.right) &&
    isBoolLiteral(elseExpr.right) &&
    thenExpr.right.value !== elseExpr.right.value
  ) {
    const varName = thenExpr.left.name
    const suggestion = thenExpr.right.value
      ? `${varName} = <condition>`
      : `${varName} = !<condition>`
    context.report({
      message: `Needless bool: this if/else assigns opposing booleans. Simplify to \`${suggestion}\`. (clippy::needless_bool)`,
      node
    })
  }
}

export default {
  create(context: Context) {
    return {
      IfStatement(node: Node) {
        if (!node.alternate) return
        const consequent = unwrapBlock(node.consequent)
        const alternate = unwrapBlock(node.alternate)
        if (!consequent || !alternate) return

        if (!checkBoolReturn(consequent, alternate, node, context)) {
          checkBoolAssign(consequent, alternate, node, context)
        }
      }
    }
  }
}
