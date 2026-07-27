// clippy::map_unit_fn — using .map() for side effects instead of .forEach()
// Detects: arr.map(fn) where the result is unused (ExpressionStatement)
// In Rust, this is .map(f) where f returns ()

import type { Context, Node } from '../types.ts'
import { isMethodCall } from '../types.ts'

export default {
  create(context: Context) {
    return {
      ExpressionStatement(node: Node) {
        const expr = node.expression
        if (!isMethodCall(expr, 'map')) return

        context.report({
          message:
            'Map void return: `.map()` result is unused. Use `.forEach()` for side effects. (clippy::map_unit_fn)',
          node
        })
      }
    }
  }
}
