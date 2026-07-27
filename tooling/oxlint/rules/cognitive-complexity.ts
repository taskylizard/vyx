// clippy::cognitive_complexity — function exceeds complexity threshold
// Uses a simplified cognitive complexity model:
// - +1 for each: if, else if, else, for, for-in, for-of, while, do-while, catch, ternary (?:)
// - +1 for each: &&, || (logical operators)
// - +1 nesting bonus per level of nesting for control flow
// Default threshold: 25 (matches Clippy)

import type { Context, Node } from '../types.ts'

const THRESHOLD = 25

type WalkFn = (n: Node, nesting: number) => void

function walkChildren(n: Node, nesting: number, walk: WalkFn) {
  for (const key of Object.keys(n)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue
    const val = n[key]
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) walk(child, nesting)
      }
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, nesting)
    }
  }
}

function calculateComplexity(node: Node): number {
  let complexity = 0

  function walk(n: Node, nesting: number) {
    if (!n || typeof n !== 'object') return

    switch (n.type) {
      case 'IfStatement':
        complexity += 1 + nesting
        walk(n.test, nesting)
        walk(n.consequent, nesting + 1)
        if (n.alternate) {
          if (n.alternate.type === 'IfStatement') {
            complexity += 1
            walk(n.alternate.test, nesting)
            walk(n.alternate.consequent, nesting + 1)
            if (n.alternate.alternate) walk(n.alternate.alternate, nesting)
          } else {
            complexity += 1
            walk(n.alternate, nesting + 1)
          }
        }
        return

      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'CatchClause':
      case 'SwitchStatement':
        complexity += 1 + nesting
        walkChildren(n, nesting + 1, walk)
        return

      case 'ConditionalExpression':
        complexity += 1 + nesting
        walk(n.test, nesting)
        walk(n.consequent, nesting + 1)
        walk(n.alternate, nesting + 1)
        return

      case 'LogicalExpression':
        complexity += 1
        walk(n.left, nesting)
        walk(n.right, nesting)
        return

      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return
    }

    walkChildren(n, nesting, walk)
  }

  if (node.body) {
    if (node.body.type === 'BlockStatement') {
      for (const stmt of node.body.body) walk(stmt, 0)
    } else {
      walk(node.body, 0)
    }
  }

  return complexity
}

export default {
  create(context: Context) {
    function checkFunction(node: Node) {
      const complexity = calculateComplexity(node)
      if (complexity <= THRESHOLD) return

      const name =
        node.id?.name ??
        (node.parent?.type === 'VariableDeclarator' ? node.parent.id?.name : null) ??
        '<anonymous>'

      context.report({
        message: `Cognitive complexity: \`${name}\` has a complexity of ${complexity} (max ${THRESHOLD}). Consider refactoring into smaller functions. (clippy::cognitive_complexity)`,
        node
      })
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction
    }
  }
}
