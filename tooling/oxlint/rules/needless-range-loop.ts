// clippy::needless_range_loop — index-based loop where for-of suffices
// Detects: for (let i = 0; i < arr.length; i++) { ...arr[i]... }
// when `i` is only used for indexing into `arr`, not for other purposes.

import type { Context, Node } from '../types.ts'

function isZeroInit(init: Node): string | null {
  if (init.type !== 'VariableDeclaration' || init.declarations.length !== 1) return null
  const decl = init.declarations[0]
  if (decl.id?.type !== 'Identifier') return null
  if (decl.init?.type !== 'Literal' || decl.init.value !== 0) return null
  return decl.id.name
}

function isLengthTest(test: Node, indexVar: string): string | null {
  if (test.type !== 'BinaryExpression' || test.operator !== '<') return null
  if (test.left?.type !== 'Identifier' || test.left.name !== indexVar) return null
  // arr.length
  if (
    test.right?.type === 'MemberExpression' &&
    test.right.object?.type === 'Identifier' &&
    test.right.property?.type === 'Identifier' &&
    test.right.property.name === 'length'
  ) {
    return test.right.object.name
  }
  return null
}

function isIncrement(update: Node, indexVar: string): boolean {
  // i++ or i += 1
  if (
    update.type === 'UpdateExpression' &&
    update.operator === '++' &&
    update.argument?.type === 'Identifier' &&
    update.argument.name === indexVar
  )
    return true
  if (
    update.type === 'AssignmentExpression' &&
    update.operator === '+=' &&
    update.left?.type === 'Identifier' &&
    update.left.name === indexVar &&
    update.right?.type === 'Literal' &&
    update.right.value === 1
  )
    return true
  return false
}

const SKIP_KEYS = new Set(['type', 'loc', 'range', 'parent', 'start', 'end'])

function isArrayIndexAccess(n: Node, indexVar: string, arrName: string): boolean {
  return (
    n.type === 'MemberExpression' &&
    n.computed &&
    n.object?.type === 'Identifier' &&
    n.object.name === arrName &&
    n.property?.type === 'Identifier' &&
    n.property.name === indexVar
  )
}

/** Check if `indexVar` is used in the body ONLY as arr[indexVar] and nowhere else */
function onlyUsedAsIndex(body: Node, indexVar: string, arrName: string): boolean {
  let onlyIndexAccess = true

  function walk(n: Node | null | undefined) {
    if (!n || !onlyIndexAccess) return

    if (n.type === 'Identifier' && n.name === indexVar) {
      onlyIndexAccess = false
      return
    }

    if (isArrayIndexAccess(n, indexVar, arrName)) {
      walk(n.object)
      return
    }

    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue
      const val = n[key]
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object' && child.type) walk(child)
        }
      } else if (val && typeof val === 'object' && val.type) {
        walk(val)
      }
    }
  }

  walk(body)
  return onlyIndexAccess
}

export default {
  create(context: Context) {
    return {
      ForStatement(node: Node) {
        if (!node.init || !node.test || !node.update) return

        const indexVar = isZeroInit(node.init)
        if (!indexVar) return

        const arrName = isLengthTest(node.test, indexVar)
        if (!arrName) return

        if (!isIncrement(node.update, indexVar)) return

        if (onlyUsedAsIndex(node.body, indexVar, arrName)) {
          context.report({
            message: `Needless range loop: \`${indexVar}\` is only used to index \`${arrName}\`. Use \`for (const item of ${arrName})\` instead. (clippy::needless_range_loop)`,
            node
          })
        }
      }
    }
  }
}
