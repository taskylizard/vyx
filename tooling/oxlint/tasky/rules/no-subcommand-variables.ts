// tasky::no-subcommand-variables - command definitions extracted into separate variables
// Detects: subcommands: { profile: jumbleProfileSubcommand }
// Subcommands must be defined inline in the command's subcommands object, not referenced
// from a variable that merely renames the definition.

import type { Context, Node } from '../../types.ts'

export default {
  create(context: Context) {
    return {
      Property(node: Node) {
        const key = node.computed ? node.key?.value : node.key?.name
        if (key !== 'subcommands' || node.value?.type !== 'ObjectExpression') return

        for (const property of node.value.properties) {
          if (property.type !== 'Property') continue
          if (property.value?.type !== 'Identifier') continue

          const subcommand = property.key?.name ?? property.key?.value ?? '<unknown>'
          context.report({
            message: `Subcommand \`${subcommand}\` references the variable \`${property.value.name}\` instead of an inline definition. Define it directly, e.g. \`${subcommand}: slash({ ... })\`. (tasky::no-subcommand-variables)`,
            node: property
          })
        }
      }
    }
  }
}
