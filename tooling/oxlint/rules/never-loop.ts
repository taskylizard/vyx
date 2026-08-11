// clippy::never_loop — loop that always exits on the first iteration
// Detects: for/while where every path through the body ends with break/return/throw.

import type { Context, Node } from '../types.ts'

function alwaysExits(node: Node): boolean {
  switch (node.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'BreakStatement':
      return true
    case 'BlockStatement':
      return node.body.length > 0 && alwaysExits(node.body[node.body.length - 1])
    case 'IfStatement':
      return !!node.alternate && alwaysExits(node.consequent) && alwaysExits(node.alternate)
    case 'ExpressionStatement':
      return false
    default:
      return false
  }
}

function checkLoop(node: Node, context: Context) {
  const body = node.body
  if (!body?.type) return

  if (alwaysExits(body)) {
    context.report({
      message:
        'Never loop: this loop always exits on the first iteration. Consider replacing with a conditional. (clippy::never_loop)',
      node
    })
  }
}

export default {
  create(context: Context) {
    return {
      ForStatement: (node: Node) => checkLoop(node, context),
      ForOfStatement: (node: Node) => checkLoop(node, context),
      ForInStatement: (node: Node) => checkLoop(node, context),
      WhileStatement: (node: Node) => checkLoop(node, context),
      DoWhileStatement: (node: Node) => checkLoop(node, context)
    }
  }
}
