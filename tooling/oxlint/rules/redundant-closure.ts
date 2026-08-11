// clippy::redundant_closure — wrapper closures around known single-arg functions
// Detects: .map(x => String(x)) → .map(String)
// Detects: .filter(x => Boolean(x)) → .filter(Boolean)
//
// SAFETY: Only flags known-safe builtins that ignore extra arguments from .map(val, idx, arr).
// Does NOT flag arbitrary functions (e.g. parseInt takes a radix arg, so .map(parseInt) breaks).

import type { Context, Node } from '../types.ts'
import { isIdentifier } from '../types.ts'

// Builtins that only use their first argument, safe to pass directly to .map/.filter/etc.
const SAFE_SINGLE_ARG = new Set([
  'String',
  'Number',
  'Boolean',
  'BigInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI'
])

function extractSingleParamBody(callback: Node): { paramName: string; bodyExpr: Node } | null {
  if (callback.params.length !== 1) return null
  const param = callback.params[0]
  if (param === undefined || param.type !== 'Identifier') return null

  let bodyExpr: Node | null = null
  if (callback.body.type === 'BlockStatement' && callback.body.body.length === 1) {
    const stmt = callback.body.body[0]
    if (stmt === undefined) return null
    if (stmt.type === 'ReturnStatement') bodyExpr = stmt.argument
  } else if (callback.body.type !== 'BlockStatement') {
    bodyExpr = callback.body
  }

  return bodyExpr ? { paramName: param.name, bodyExpr } : null
}

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (node.callee.type !== 'MemberExpression') return
        const args = node.arguments
        if (!args || args.length !== 1) return

        const callback = args[0]
        if (callback === undefined) return
        if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
          return

        const extracted = extractSingleParamBody(callback)
        if (!extracted) return
        const { paramName, bodyExpr } = extracted

        if (bodyExpr.type !== 'CallExpression' || bodyExpr.arguments.length !== 1) return
        if (!isIdentifier(bodyExpr.arguments[0], paramName)) return

        const fnCallee = bodyExpr.callee
        if (isIdentifier(fnCallee) && SAFE_SINGLE_ARG.has(fnCallee.name)) {
          context.report({
            message: `Redundant closure: \`x => ${fnCallee.name}(x)\` can be simplified to \`${fnCallee.name}\`. (clippy::redundant_closure)`,
            node: callback
          })
        }
      }
    }
  }
}
