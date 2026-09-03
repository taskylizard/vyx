// tasky::no-trivial-type-aliases - type aliases that resolve only to a primitive or unknown
// Detects: type AccountId = string   /   type Unchecked = unknown
// A real alias adds a constraint, a brand, or structure. Chained aliases resolve to their terminal.

import type { Context, Node } from '../../types.ts'

const PRIMITIVE_KEYWORDS = new Set([
  'TSBigIntKeyword',
  'TSBooleanKeyword',
  'TSNullKeyword',
  'TSNumberKeyword',
  'TSStringKeyword',
  'TSSymbolKeyword',
  'TSUndefinedKeyword'
])

function collectAliases(program: Node): Map<string, Node> {
  const aliases = new Map<string, Node>()

  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration && declaration.type === 'TSTypeAliasDeclaration') {
      aliases.set(declaration.id.name, declaration)
    }
  }

  return aliases
}

function resolveTerminal(
  alias: Node,
  aliases: Map<string, Node>,
  seen: Set<string>
): 'primitive' | 'unknown' | null {
  if (alias.typeParameters && alias.typeParameters.params.length) return null

  const annotation = alias.typeAnnotation
  if (annotation.type === 'TSUnknownKeyword') return 'unknown'
  if (PRIMITIVE_KEYWORDS.has(annotation.type)) return 'primitive'
  if (annotation.type !== 'TSTypeReference') return null
  if (annotation.typeName.type !== 'Identifier' || annotation.typeArguments) return null
  if (seen.has(annotation.typeName.name)) return null

  const referencedAlias = aliases.get(annotation.typeName.name)
  if (!referencedAlias) return null

  seen.add(annotation.typeName.name)
  return resolveTerminal(referencedAlias, aliases, seen)
}

export default {
  create(context: Context) {
    return {
      'Program:exit'(program: Node) {
        const aliases = collectAliases(program)
        for (const [name, alias] of aliases) {
          const terminal = resolveTerminal(alias, aliases, new Set([name]))
          if (!terminal) continue

          const message =
            terminal === 'unknown'
              ? `Type alias \`${name}\` hides missing type evidence. Keep unknown visible at the boundary, then parse or narrow it before use. (tasky::no-trivial-type-aliases)`
              : `Type alias \`${name}\` adds no structure to its primitive type. Use the primitive directly, or add a real constraint or brand. (tasky::no-trivial-type-aliases)`

          context.report({ message, node: alias })
        }
      }
    }
  }
}
