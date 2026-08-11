// clippy::too_many_arguments — functions with too many parameters
// Default threshold: 5 (Clippy uses 7, but JS convention favors options objects earlier)

import type { Context, Node } from '../types.ts'

const THRESHOLD = 5

function checkParams(node: Node, context: Context) {
  const params: Node[] = node.params
  if (params.length <= THRESHOLD) return

  const name =
    node.id?.name ??
    (node.parent?.type === 'VariableDeclarator' ? node.parent.id?.name : null) ??
    '<anonymous>'

  context.report({
    message: `Too many arguments: \`${name}\` has ${params.length} parameters (max ${THRESHOLD}). Consider using an options object. (clippy::too_many_arguments)`,
    node
  })
}

export default {
  create(context: Context) {
    return {
      FunctionDeclaration(node: Node) {
        checkParams(node, context)
      },
      FunctionExpression(node: Node) {
        checkParams(node, context)
      },
      ArrowFunctionExpression(node: Node) {
        checkParams(node, context)
      }
    }
  }
}
