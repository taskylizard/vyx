// clippy::needless_continue — unnecessary continue at the end of a loop body
// Detects: for (...) { ...; continue; } — the continue is a no-op
// Detects: for (...) { if (cond) { stuff } else { continue; } } — else continue is redundant

import type { Context, Node } from '../types.ts'

function checkLoopBody(body: Node, context: Context) {
  if (body.type !== 'BlockStatement' || body.body.length === 0) return

  const stmts: Node[] = body.body
  const last = stmts[stmts.length - 1]!

  // Direct: last statement is bare continue
  if (last.type === 'ContinueStatement' && !last.label) {
    context.report({
      message:
        'Needless continue: `continue` at the end of a loop body has no effect. (clippy::needless_continue)',
      node: last
    })
    return
  }

  // Else-continue: if (...) { ... } else { continue; }
  if (last.type === 'IfStatement' && last.alternate) {
    const alt = last.alternate
    const altBody = alt.type === 'BlockStatement' ? alt.body : [alt]
    if (altBody.length === 1 && altBody[0]!.type === 'ContinueStatement' && !altBody[0]!.label) {
      context.report({
        message:
          'Needless continue: `else { continue; }` at the end of a loop is redundant. Remove the else branch. (clippy::needless_continue)',
        node: altBody[0]!
      })
    }
  }
}

export default {
  create(context: Context) {
    return {
      ForStatement: (node: Node) => checkLoopBody(node.body, context),
      ForOfStatement: (node: Node) => checkLoopBody(node.body, context),
      ForInStatement: (node: Node) => checkLoopBody(node.body, context),
      WhileStatement: (node: Node) => checkLoopBody(node.body, context),
      DoWhileStatement: (node: Node) => checkLoopBody(node.body, context)
    }
  }
}
