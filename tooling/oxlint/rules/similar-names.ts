// clippy::similar_names — variables with confusingly similar names
// Detects: names differing by one character (item/items, data/date, form/from)
// Minimum length: 3 characters. Excludes common pairs like i/j/k, x/y/z.

import type { Context, Node } from '../types.ts'

const ALLOWED_PAIRS = new Set([
  'i,j',
  'j,k',
  'i,k',
  'x,y',
  'y,z',
  'x,z',
  'a,b',
  'b,c',
  'a,c',
  'n,m',
  'r,s'
])

function sameLengthSimilar(a: string, b: string): boolean {
  let diffs = 0
  let firstDiff = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (diffs === 0) firstDiff = i
      diffs++
      if (diffs > 2) return false
    }
  }
  if (diffs <= 1) return diffs === 1
  return a[firstDiff] === b[firstDiff + 1] && a[firstDiff + 1] === b[firstDiff]
}

function diffLengthSimilar(a: string, b: string): boolean {
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let diffs = 0
  let si = 0
  for (const ch of longer) {
    if (shorter[si] === ch) {
      si++
    } else {
      diffs++
      if (diffs > 1) return false
    }
  }
  return true
}

/** Returns true if names are confusingly similar (edit distance 1 or single transposition) */
function areSimilar(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) return sameLengthSimilar(a, b)
  return diffLengthSimilar(a, b)
}

const SKIP_KEYS = new Set(['type', 'loc', 'range', 'parent', 'start', 'end'])
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression'
])

function collectParams(node: Node, names: Map<string, Node>) {
  if (!node.params) return
  for (const p of node.params) {
    if (p.type === 'Identifier') names.set(p.name, p)
    if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier')
      names.set(p.left.name, p.left)
  }
}

function collectNames(node: Node | null | undefined, names: Map<string, Node>) {
  if (!node) return

  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    names.set(node.id.name, node.id)
  }
  if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
    names.set(node.id.name, node.id)
  }

  collectParams(node, names)

  if (FUNCTION_TYPES.has(node.type)) return

  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) collectNames(child, names)
      }
    } else if (val && typeof val === 'object' && val.type) {
      collectNames(val, names)
    }
  }
}

function reportSimilarPairs(names: Map<string, Node>, context: Context) {
  const nameList = [...names.entries()]
  const reported = new Set<string>()

  for (let i = 0; i < nameList.length; i++) {
    for (let j = i + 1; j < nameList.length; j++) {
      const [nameA] = nameList[i]
      const [nameB, nodeB] = nameList[j]

      if (nameA.length < 3 || nameB.length < 3) continue

      const pair = nameA < nameB ? `${nameA},${nameB}` : `${nameB},${nameA}`
      if (ALLOWED_PAIRS.has(pair) || reported.has(pair)) continue

      if (areSimilar(nameA.toLowerCase(), nameB.toLowerCase())) {
        reported.add(pair)
        context.report({
          message: `Similar names: \`${nameA}\` and \`${nameB}\` differ by only one character, which is easy to confuse. (clippy::similar_names)`,
          node: nodeB
        })
      }
    }
  }
}

export default {
  create(context: Context) {
    function checkScope(node: Node) {
      const names = new Map<string, Node>()
      collectParams(node, names)

      if (node.body?.type === 'BlockStatement') {
        for (const stmt of node.body.body) collectNames(stmt, names)
      }

      reportSimilarPairs(names, context)
    }

    return {
      FunctionDeclaration: checkScope,
      FunctionExpression: checkScope,
      ArrowFunctionExpression: checkScope
    }
  }
}
