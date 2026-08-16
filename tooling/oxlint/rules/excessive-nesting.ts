// clippy::excessive_nesting — code nested beyond a threshold
// Default threshold: 5 levels

import type { Context, Node } from '../types.ts'

const THRESHOLD = 5

const NESTING_NODES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement'
])

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression'
])
const SKIP_KEYS = new Set(['type', 'loc', 'range', 'parent', 'start', 'end'])

function walkChildren(node: Node, depth: number, walk: (n: Node, d: number) => void) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) walk(child, depth)
      }
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, depth)
    }
  }
}

export default {
  create(context: Context) {
    let reported = false

    function walk(node: Node, depth: number) {
      if (reported) return
      if (depth > 0 && FUNCTION_TYPES.has(node.type)) return

      const isNesting = NESTING_NODES.has(node.type)
      const newDepth = isNesting ? depth + 1 : depth

      if (newDepth > THRESHOLD && isNesting) {
        reported = true
        context.report({
          message: `Excessive nesting: this code is nested ${newDepth} levels deep (max ${THRESHOLD}). Consider extracting into helper functions. (clippy::excessive_nesting)`,
          node
        })
        return
      }

      walkChildren(node, newDepth, walk)
    }

    function checkFunction(node: Node) {
      reported = false
      walk(node.body, 0)
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction
    }
  }
}
