// clippy::match_same_arms — switch cases with identical bodies
// Detects: switch where two or more cases have the same code.

import type { Context, Node } from '../types.ts'

function caseBodySource(caseNode: Node, sourceText: string): string {
  const stmts: Node[] = caseNode.consequent
  if (stmts.length === 0) return ''
  // Exclude break statements from comparison
  const meaningful = stmts.filter((s: Node) => s.type !== 'BreakStatement')
  if (meaningful.length === 0) return ''
  const first = meaningful[0]
  const last = meaningful[meaningful.length - 1]
  if (first.start === null || last.end === null) return ''
  return sourceText.slice(first.start, last.end)
}

export default {
  create(context: Context) {
    return {
      SwitchStatement(node: Node) {
        const cases: Node[] = node.cases
        if (cases.length < 2) return

        const seen = new Map<string, Node>()

        for (const c of cases) {
          if (c.test === null) continue // skip default
          const body = caseBodySource(c, context.sourceCode.text)
          if (!body) continue

          const existing = seen.get(body)
          if (existing) {
            context.report({
              message:
                'Match same arms: multiple switch cases have identical bodies. Consider combining them. (clippy::match_same_arms)',
              node: c
            })
          } else {
            seen.set(body, c)
          }
        }
      }
    }
  }
}
