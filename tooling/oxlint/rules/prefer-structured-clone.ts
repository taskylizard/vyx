// clippy principle: "don't reinvent the standard library"
// Detects: JSON.parse(JSON.stringify(x)) → structuredClone(x)
// structuredClone handles more types (Date, RegExp, Map, Set, ArrayBuffer, etc.)
// and avoids the gotchas of JSON round-tripping (undefined → missing, functions → missing).

import type { Context, Node } from '../types.ts'
import { isCallOf } from '../types.ts'

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        // JSON.parse(JSON.stringify(x))
        if (!isCallOf(node, 'JSON', 'parse')) return

        const args = node.arguments
        if (!args || args.length !== 1) return

        const inner = args[0]!
        if (isCallOf(inner, 'JSON', 'stringify') && inner.arguments?.length === 1) {
          context.report({
            message:
              "Prefer structuredClone: `JSON.parse(JSON.stringify(x))` can be replaced with `structuredClone(x)`, which handles more types and is more correct. (clippy: don't reinvent stdlib)",
            node
          })
        }
      }
    }
  }
}
