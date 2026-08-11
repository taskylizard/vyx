// clippy::single_match — switch statement with only one non-default case
// Detects: switch(x) { case 'a': ...; break; } → if (x === 'a') { ... }

import type { Context, Node } from '../types.ts'

export default {
  create(context: Context) {
    return {
      SwitchStatement(node: Node) {
        const cases: Node[] = node.cases

        const nonDefaultCases = cases.filter((c: Node) => c.test !== null)
        const defaultCase = cases.find((c: Node) => c.test === null)

        if (nonDefaultCases.length !== 1) return

        // If single case + optional default, suggest if/else
        const suggestion = defaultCase ? 'if/else' : 'if'
        context.report({
          message: `Single-case switch: this switch has only one case. Use an \`${suggestion}\` statement instead. (clippy::single_match)`,
          node
        })
      }
    }
  }
}
