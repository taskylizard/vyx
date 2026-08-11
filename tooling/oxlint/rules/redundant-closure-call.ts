// clippy::redundant_closure_call — immediately invoked function expression wrapping a simple expression
// Detects: (() => expr)() → expr
// Detects: (function() { return expr; })() → expr
// Only flags single-expression/return IIFEs, not those with side effects or multiple statements.

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        const { callee } = node
        if (node.arguments.length !== 0) return

        // Unwrap parenthesized expression — the callee may be in parens
        let fn = callee
        // In ESTree, parens don't produce a wrapper node, so callee is the function directly

        if (fn.type === 'ArrowFunctionExpression' && fn.params.length === 0) {
          // (() => expr)()
          if (fn.body.type !== 'BlockStatement') {
            context.report({
              message:
                'Redundant closure call: this IIFE wraps a single expression. Use the expression directly. (clippy::redundant_closure_call)',
              node
            })
            return
          }
          // (() => { return expr; })()
          if (fn.body.body.length === 1) {
            const stmt = fn.body.body[0]
            if (stmt === undefined) return
            if (stmt.type === 'ReturnStatement' && stmt.argument) {
              context.report({
                message:
                  'Redundant closure call: this IIFE wraps a single return. Use the expression directly. (clippy::redundant_closure_call)',
                node
              })
            }
          }
          return
        }

        if (
          fn.type === 'FunctionExpression' &&
          fn.params.length === 0 &&
          fn.body.type === 'BlockStatement' &&
          fn.body.body.length === 1
        ) {
          const stmt = fn.body.body[0]
          if (stmt === undefined) return
          if (stmt.type === 'ReturnStatement' && stmt.argument) {
            context.report({
              message:
                'Redundant closure call: this IIFE wraps a single return. Use the expression directly. (clippy::redundant_closure_call)',
              node
            })
          }
        }
      }
    }
  }
}
