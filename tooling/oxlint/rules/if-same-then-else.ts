// clippy::if_same_then_else — if/else with identical bodies
// Almost certainly a bug or dead code.

import type { Context, Node } from '../types.ts'

function sourceRange(node: Node, text: string): string {
  if (node.start != null && node.end != null) {
    return text.slice(node.start, node.end)
  }
  return ''
}

export default {
  create(context: Context) {
    return {
      IfStatement(node: Node) {
        if (!node.alternate) return
        if (node.alternate.type === 'IfStatement') return // skip else-if chains

        const text = context.sourceCode.text
        const consequentSrc = sourceRange(node.consequent, text)
        const alternateSrc = sourceRange(node.alternate, text)

        if (consequentSrc && consequentSrc === alternateSrc) {
          context.report({
            message:
              'If same then else: both branches of this if/else are identical. (clippy::if_same_then_else)',
            node
          })
        }
      }
    }
  }
}
