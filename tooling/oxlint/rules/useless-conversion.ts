// clippy::useless_conversion — redundant type conversions
// Detects: String("hello"), Number(42), Boolean(true), Array.from([...])
// Also: "str".toString(), (42).valueOf()

import type { Context, Node } from '../types.ts'
import { isIdentifier, isCallOf } from '../types.ts'

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        const { callee } = node
        const callArgs = node.arguments
        if (!callArgs || callArgs.length !== 1) return
        const arg = callArgs[0]

        // String("literal string")
        if (
          isIdentifier(callee, 'String') &&
          arg.type === 'Literal' &&
          typeof arg.value === 'string'
        ) {
          context.report({
            message:
              'Useless conversion: `String()` called on a string literal. (clippy::useless_conversion)',
            node
          })
          return
        }

        // Number(42)
        if (
          isIdentifier(callee, 'Number') &&
          arg.type === 'Literal' &&
          typeof arg.value === 'number'
        ) {
          context.report({
            message:
              'Useless conversion: `Number()` called on a number literal. (clippy::useless_conversion)',
            node
          })
          return
        }

        // Boolean(true/false)
        if (
          isIdentifier(callee, 'Boolean') &&
          arg.type === 'Literal' &&
          typeof arg.value === 'boolean'
        ) {
          context.report({
            message:
              'Useless conversion: `Boolean()` called on a boolean literal. (clippy::useless_conversion)',
            node
          })
          return
        }

        // Array.from([...])
        if (isCallOf(node, 'Array', 'from') && arg.type === 'ArrayExpression') {
          context.report({
            message:
              'Useless conversion: `Array.from()` called on an array literal. Use the array directly. (clippy::useless_conversion)',
            node
          })
          return
        }
      },

      // Handle 0-arg method calls like "str".toString(), (42).valueOf()
      'CallExpression:exit'(node: Node) {
        const { callee } = node
        const args = node.arguments
        if (!args || args.length !== 0) return
        if (callee.type !== 'MemberExpression') return

        const obj = callee.object
        const method = callee.property
        if (method.type !== 'Identifier') return

        // "str".toString()
        if (obj.type === 'Literal' && typeof obj.value === 'string' && method.name === 'toString') {
          context.report({
            message:
              'Useless conversion: `.toString()` called on a string literal. (clippy::useless_conversion)',
            node
          })
          return
        }

        // (42).toString() is NOT useless — it converts number to string
        // But (42).valueOf() IS useless
        if (obj.type === 'Literal' && typeof obj.value === 'number' && method.name === 'valueOf') {
          context.report({
            message:
              'Useless conversion: `.valueOf()` called on a number literal. (clippy::useless_conversion)',
            node
          })
        }
      }
    }
  }
}
