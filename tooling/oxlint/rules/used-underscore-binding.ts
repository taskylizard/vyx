// clippy::used_underscore_binding — variables prefixed with _ that are actually used
// Convention: _ prefix means "intentionally unused." Using such variables is confusing.

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    const declared = new Map<string, Node>()
    const used = new Set<string>()

    return {
      VariableDeclarator(node: Node) {
        if (
          node.id?.type === 'Identifier' &&
          node.id.name.startsWith('_') &&
          node.id.name !== '_'
        ) {
          declared.set(node.id.name, node.id)
        }
      },
      Identifier(node: Node) {
        if (
          node.name?.startsWith('_') &&
          node.name !== '_' &&
          (node.parent?.type !== 'VariableDeclarator' || node.parent.id !== node)
        ) {
          used.add(node.name)
        }
      },
      'Program:exit'() {
        for (const [name, declNode] of declared) {
          if (used.has(name)) {
            context.report({
              message: `Used underscore binding: \`${name}\` starts with \`_\` (conventionally unused) but is actually used. Remove the underscore prefix. (clippy::used_underscore_binding)`,
              node: declNode
            })
          }
        }
      }
    }
  }
}
