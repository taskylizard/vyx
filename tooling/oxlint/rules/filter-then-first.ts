// clippy::filter_next — .filter(fn)[0] instead of .find(fn)
// Detects: arr.filter(fn)[0] → arr.find(fn)
// The Rust equivalent is .filter().next() → .find()

import type { Context, Node } from '../types.ts'
import { isLiteral, isMethodCall } from '../types.ts'

export default {
  create(context: Context) {
    return {
      MemberExpression(node: Node) {
        // arr.filter(fn)[0]
        if (!node.computed || !isLiteral(node.property, 0)) return

        const obj = node.object
        if (!isMethodCall(obj, 'filter')) return

        context.report({
          message:
            'Filter then first: `.filter(fn)[0]` is less efficient and readable than `.find(fn)`. (clippy::filter_next)',
          node
        })
      }
    }
  }
}
