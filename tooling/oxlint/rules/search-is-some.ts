// clippy::search_is_some — .find() compared to undefined/null when .some() suffices
// Detects: arr.find(fn) !== undefined → arr.some(fn)
// Detects: arr.find(fn) != null → arr.some(fn)

import type { Context, Node } from '../types.ts'
import { isMethodCall } from '../types.ts'

function isNullish(node: Node): boolean {
  if (node.type === 'Identifier' && node.name === 'undefined') return true
  if (node.type === 'Literal' && node.value === null) return true
  return false
}

function isFindCall(node: Node): boolean {
  return isMethodCall(node, 'find')
}

function matchesFindNullish(left: Node, right: Node): boolean {
  return (isFindCall(left) && isNullish(right)) || (isNullish(left) && isFindCall(right))
}

export default {
  create(context: Context) {
    return {
      BinaryExpression(node: Node) {
        const { operator, left, right } = node
        if (!matchesFindNullish(left, right)) return

        if (operator === '!==' || operator === '!=') {
          context.report({
            message:
              "Search is some: `.find(fn) !== undefined` can be simplified to `.some(fn)` when you don't need the found value. (clippy::search_is_some)",
            node
          })
        } else if (operator === '===' || operator === '==') {
          context.report({
            message:
              "Search is some: `.find(fn) === undefined` can be simplified to `!.some(fn)` when you don't need the found value. (clippy::search_is_some)",
            node
          })
        }
      }
    }
  }
}
