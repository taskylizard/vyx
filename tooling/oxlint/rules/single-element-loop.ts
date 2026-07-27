// clippy::single_element_loop — looping over a single-element array literal
// Detects: for (const x of [value]) { ... } → just use value directly

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    return {
      ForOfStatement(node: Node) {
        const right = node.right
        if (right?.type === 'ArrayExpression' && right.elements?.length === 1) {
          context.report({
            message:
              'Single element loop: this loop iterates over a single-element array. Use the value directly. (clippy::single_element_loop)',
            node
          })
        }
      }
    }
  }
}
