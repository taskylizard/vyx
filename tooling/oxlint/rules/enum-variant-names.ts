// clippy::enum_variant_names — TS enum members with redundant prefix or suffix
// Detects: enum Color { ColorRed, ColorGreen, ColorBlue } — "Color" prefix is redundant
// Also: enum Status { StatusActive, StatusInactive } — all share the enum name as prefix

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    return {
      TSEnumDeclaration(node: Node) {
        const enumName = node.id?.name
        if (!enumName) return
        const members: Node[] = node.members ?? node.body?.members
        if (!members || members.length < 2) return

        const names: string[] = members
          .map((m: Node) => (m.id?.type === 'Identifier' ? m.id.name : null))
          .filter((n: string | null): n is string => n !== null)

        if (names.length < 2) return

        const lowerEnum = enumName.toLowerCase()

        // Check prefix: all members start with the enum name
        const allPrefixed = names.every((n) => n.toLowerCase().startsWith(lowerEnum))
        if (allPrefixed) {
          context.report({
            message: `Enum variant names: all members of \`${enumName}\` are prefixed with \`${enumName}\`. Remove the redundant prefix. (clippy::enum_variant_names)`,
            node
          })
          return
        }

        // Check suffix: all members end with the enum name
        const allSuffixed = names.every((n) => n.toLowerCase().endsWith(lowerEnum))
        if (allSuffixed) {
          context.report({
            message: `Enum variant names: all members of \`${enumName}\` are suffixed with \`${enumName}\`. Remove the redundant suffix. (clippy::enum_variant_names)`,
            node
          })
        }
      }
    }
  }
}
