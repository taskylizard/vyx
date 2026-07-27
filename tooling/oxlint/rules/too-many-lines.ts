// clippy::too_many_lines — functions exceeding a line count threshold
// Default threshold: 100 lines (matches Clippy default)

import type { Context, Node } from '../types.ts'

const THRESHOLD = 100

function countLines(node: Node, sourceText: string): number {
  if (node.loc) return node.loc.end.line - node.loc.start.line + 1
  if (node.start != null && node.end != null) {
    return sourceText.substring(node.start, node.end).split('\n').length
  }
  return 0
}

function checkLines(node: Node, context: Context) {
  const lines = countLines(node, context.sourceCode.text)
  if (lines <= THRESHOLD) return

  const name =
    node.id?.name ??
    (node.parent?.type === 'VariableDeclarator' ? node.parent.id?.name : null) ??
    '<anonymous>'

  context.report({
    message: `Too many lines: \`${name}\` is ${lines} lines long (max ${THRESHOLD}). Consider breaking it into smaller functions. (clippy::too_many_lines)`,
    node
  })
}

export default {
  create(context: Context) {
    return {
      FunctionDeclaration(node: Node) {
        checkLines(node, context)
      },
      FunctionExpression(node: Node) {
        checkLines(node, context)
      },
      ArrowFunctionExpression(node: Node) {
        checkLines(node, context)
      }
    }
  }
}
