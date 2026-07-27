// clippy::collapsible_if — nested ifs that can be merged with &&
// Detects: if (a) { if (b) { ... } } → if (a && b) { ... }
// NOT covered by eslint/no-lonely-if (which only catches else { if })

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    return {
      IfStatement(node: Node) {
        // Only applies when outer if has no else
        if (node.alternate) return

        const body = node.consequent
        if (!body) return

        // Get the single statement inside the consequent block
        let inner: Node | null = null
        if (body.type === 'BlockStatement' && body.body.length === 1) {
          inner = body.body[0]
        } else if (body.type === 'IfStatement') {
          inner = body
        }

        if (!inner || inner.type !== 'IfStatement') return

        // Inner if must also have no else
        if (inner.alternate) return

        context.report({
          message:
            'Collapsible if: these nested ifs can be combined with `&&`. (clippy::collapsible_if)',
          node
        })
      }
    }
  }
}
