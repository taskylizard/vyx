// clippy::int_plus_one — x >= y + 1 can be simplified to x > y
// Also: x + 1 <= y → x < y, x - 1 >= y → x > y, etc.

import type { Context, Node } from '../types.ts'
import { isLiteral } from '../types.ts'

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        const { operator, left, right } = node

        // x >= y + 1 → x > y
        if (
          operator === '>=' &&
          right.type === 'BinaryExpression' &&
          right.operator === '+' &&
          isLiteral(right.right, 1)
        ) {
          context.report({
            message:
              'Int plus one: `x >= y + 1` can be simplified to `x > y`. (clippy::int_plus_one)',
            node
          })
          return
        }

        // x + 1 <= y → x < y
        if (
          operator === '<=' &&
          left.type === 'BinaryExpression' &&
          left.operator === '+' &&
          isLiteral(left.right, 1)
        ) {
          context.report({
            message:
              'Int plus one: `x + 1 <= y` can be simplified to `x < y`. (clippy::int_plus_one)',
            node
          })
          return
        }

        // x - 1 >= y → x > y
        if (
          operator === '>=' &&
          left.type === 'BinaryExpression' &&
          left.operator === '-' &&
          isLiteral(left.right, 1)
        ) {
          context.report({
            message:
              'Int plus one: `x - 1 >= y` can be simplified to `x > y`. (clippy::int_plus_one)',
            node
          })
          return
        }

        // y <= x - 1 → y < x
        if (
          operator === '<=' &&
          right.type === 'BinaryExpression' &&
          right.operator === '-' &&
          isLiteral(right.right, 1)
        ) {
          context.report({
            message:
              'Int plus one: `y <= x - 1` can be simplified to `y < x`. (clippy::int_plus_one)',
            node
          })
        }
      }
    }
  }
}
