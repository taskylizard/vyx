// clippy::bool_to_int_with_if — converting a boolean to 0/1 with a ternary or if/else
// Detects: cond ? 1 : 0 → +cond or Number(cond)
// Detects: cond ? 0 : 1 → +!cond or Number(!cond)

import type { Context, Node } from '../types.ts'
import { isLiteral } from '../types.ts'

export default {
  create(context: Context) {
    return {
      ConditionalExpression(node: Node) {
        const { consequent, alternate } = node

        if (isLiteral(consequent, 1) && isLiteral(alternate, 0)) {
          context.report({
            message:
              'Bool to int with if: `cond ? 1 : 0` can be simplified to `Number(cond)` or `+cond`. (clippy::bool_to_int_with_if)',
            node
          })
        } else if (isLiteral(consequent, 0) && isLiteral(alternate, 1)) {
          context.report({
            message:
              'Bool to int with if: `cond ? 0 : 1` can be simplified to `Number(!cond)` or `+!cond`. (clippy::bool_to_int_with_if)',
            node
          })
        }
      }
    }
  }
}
