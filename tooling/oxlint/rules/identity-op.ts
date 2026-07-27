// clippy::identity_op — operations that have no effect
// Detects: x + 0, 0 + x, x - 0, x * 1, 1 * x, x / 1, x ** 1
// NOT covered by oxc/erasing-op (which covers x * 0, x & 0 — destructive ops)

import type { Context, Node } from '../types.ts'
import { isLiteral } from '../types.ts'

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        const { operator, left, right } = node

        let match = false

        switch (operator) {
          case '+':
            // Skip string concatenation: "str" + 0 is not identity
            if (isLiteral(left) && typeof left.value === 'string') break
            if (isLiteral(right) && typeof right.value === 'string') break
            match = isLiteral(left, 0) || isLiteral(right, 0)
            break
          case '-':
            match = isLiteral(right, 0)
            break
          case '*':
            match = isLiteral(left, 1) || isLiteral(right, 1)
            break
          case '/':
          case '**':
            match = isLiteral(right, 1)
            break
        }

        if (match) {
          context.report({
            message: `Identity op: \`${operator} ${operator === '+' || operator === '-' ? '0' : '1'}\` has no effect. (clippy::identity_op)`,
            node
          })
        }
      }
    }
  }
}
