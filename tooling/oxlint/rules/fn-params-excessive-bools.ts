// clippy::fn_params_excessive_bools — too many boolean parameters (easy to mix up at call sites)
// Default threshold: 3 boolean params

import type { Context, Node } from '../types.ts'

const THRESHOLD = 3

function countBoolParams(node: Node): number {
  const params: Node[] = node.params
  let count = 0
  for (const p of params) {
    // Check for TypeScript boolean type annotation: param: boolean
    if (p.type === 'Identifier' && p.typeAnnotation) {
      const ann = p.typeAnnotation.typeAnnotation ?? p.typeAnnotation
      if (ann.type === 'TSBooleanKeyword') count++
    }
    // Also check assignment patterns with boolean defaults: param = true/false
    if (
      p.type === 'AssignmentPattern' &&
      p.right?.type === 'Literal' &&
      typeof p.right.value === 'boolean'
    ) {
      count++
    }
  }
  return count
}

function checkFunction(node: Node, context: Context) {
  const boolCount = countBoolParams(node)
  if (boolCount <= THRESHOLD) return

  const name = node.id?.name ?? '<anonymous>'
  context.report({
    message: `Excessive bools: \`${name}\` has ${boolCount} boolean parameters (max ${THRESHOLD}). Consider using an options object. (clippy::fn_params_excessive_bools)`,
    node
  })
}

export default {
  create(context: Context) {
    return {
      FunctionDeclaration: (node: Node) => checkFunction(node, context),
      FunctionExpression: (node: Node) => checkFunction(node, context),
      ArrowFunctionExpression: (node: Node) => checkFunction(node, context)
    }
  }
}
