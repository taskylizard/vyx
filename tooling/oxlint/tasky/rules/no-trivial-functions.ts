// tasky::no-trivial-functions - low-use top-level functions that only forward arguments or read a property
// Detects: const getName = user => user.profile.name
// Detects: const parse = value => parseValue(value)
// A candidate is only reported when it has fewer external references than MIN_REFERENCES,
// and exported functions are always exempt (public ESM interface is a real role).

import type { Context, Node } from '../../types.ts'

const MIN_REFERENCES = 5

interface Candidate {
  functionNode: Node
  identifier: Node
  reportNode: Node
}

function walk(
  node: Node,
  parent: Node | null,
  visit: (node: Node, parent: Node | null) => void
): void {
  visit(node, parent)
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'range' || key === 'loc') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof item.type === 'string')
          walk(item, node, visit)
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, node, visit)
    }
  }
}

function contains(outer: Node, inner: Node): boolean {
  return inner.start >= outer.start && inner.end <= outer.end
}

function getForwardedParameterNames(node: Node): Array<{ name: string; rest: boolean }> | null {
  const parameters: Array<{ name: string; rest: boolean }> = []

  for (const parameter of node.params) {
    if (parameter.type === 'Identifier') {
      parameters.push({ name: parameter.name, rest: false })
    } else if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') {
      parameters.push({ name: parameter.argument.name, rest: true })
    } else {
      return null
    }
  }

  return parameters
}

function getSingleExpression(node: Node): Node | null {
  if (node.body.type !== 'BlockStatement') return node.body
  if (node.body.body.length !== 1) return null

  const statement = node.body.body[0]
  if (statement.type === 'ReturnStatement') return statement.argument
  if (statement.type === 'ExpressionStatement') return statement.expression
  return null
}

function getMemberRoot(node: Node): Node {
  let current = node
  while (current.type === 'MemberExpression') current = current.object
  return current
}

function isDirectParameterAccess(
  expression: Node,
  parameters: Array<{ name: string; rest: boolean }>
): boolean {
  if (expression.type !== 'MemberExpression' || expression.optional) return false

  const root = getMemberRoot(expression)
  return (
    root.type === 'Identifier' &&
    parameters.some((parameter) => !parameter.rest && parameter.name === root.name)
  )
}

function isTransparentCall(
  expression: Node,
  parameters: Array<{ name: string; rest: boolean }>
): boolean {
  if (expression.type !== 'CallExpression' || expression.optional) return false
  if (expression.arguments.length !== parameters.length) return false

  return expression.arguments.every((argument: Node, index: number) => {
    const parameter = parameters[index]
    if (parameter.rest) {
      return (
        argument.type === 'SpreadElement' &&
        argument.argument.type === 'Identifier' &&
        argument.argument.name === parameter.name
      )
    }
    return argument.type === 'Identifier' && argument.name === parameter.name
  })
}

function isTrivialFunction(node: Node): boolean {
  if (node.async || node.generator) return false

  const parameters = getForwardedParameterNames(node)
  const expression = getSingleExpression(node)
  if (!parameters || !expression) return false

  return (
    isDirectParameterAccess(expression, parameters) || isTransparentCall(expression, parameters)
  )
}

function addCandidate(
  identifier: Node,
  functionNode: Node,
  reportNode: Node,
  candidates: Candidate[]
): void {
  candidates.push({ identifier, functionNode, reportNode })
}

function collectFunctionCandidates(
  declaration: Node,
  exported: boolean,
  candidates: Candidate[],
  exportedNames: Set<string>
): void {
  if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    if (exported) exportedNames.add(declaration.id.name)
    addCandidate(declaration.id, declaration, declaration, candidates)
    return
  }

  if (declaration.type !== 'VariableDeclaration') return

  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== 'Identifier' || !declarator.init) continue
    if (
      declarator.init.type !== 'ArrowFunctionExpression' &&
      declarator.init.type !== 'FunctionExpression'
    ) {
      continue
    }
    if (exported) exportedNames.add(declarator.id.name)
    addCandidate(declarator.id, declarator.init, declarator, candidates)
  }
}

function collectExportSpecifierNames(statement: Node, exportedNames: Set<string>): void {
  if (statement.source || statement.exportKind === 'type') return

  for (const specifier of statement.specifiers) {
    if (specifier.exportKind !== 'type' && specifier.local.type === 'Identifier') {
      exportedNames.add(specifier.local.name)
    }
  }
}

function collectDefaultExportName(declaration: Node, exportedNames: Set<string>): void {
  if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    exportedNames.add(declaration.id.name)
  }
  if (declaration.type === 'Identifier') exportedNames.add(declaration.name)
}

function collectTopLevelCandidates(program: Node): {
  candidates: Candidate[]
  exportedNames: Set<string>
} {
  const candidates: Candidate[] = []
  const exportedNames = new Set<string>()

  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (
        statement.declaration &&
        (statement.declaration.type === 'FunctionDeclaration' ||
          statement.declaration.type === 'VariableDeclaration')
      ) {
        collectFunctionCandidates(statement.declaration, true, candidates, exportedNames)
      }
      collectExportSpecifierNames(statement, exportedNames)
      continue
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      collectDefaultExportName(statement.declaration, exportedNames)
      continue
    }

    if (statement.type === 'FunctionDeclaration' || statement.type === 'VariableDeclaration') {
      collectFunctionCandidates(statement, false, candidates, exportedNames)
    }
  }

  return { candidates, exportedNames }
}

function isTypeOnlyReference(identifier: Node): boolean {
  const parent = identifier.parent
  if (!parent || !parent.type.startsWith('TS')) return false

  if (
    (parent.type === 'TSAsExpression' ||
      parent.type === 'TSInstantiationExpression' ||
      parent.type === 'TSNonNullExpression' ||
      parent.type === 'TSTypeAssertion') &&
    parent.expression === identifier
  ) {
    return false
  }

  return true
}

function countExternalReferences(program: Node, candidate: Candidate): number {
  let count = 0
  walk(program, null, (node, parent) => {
    if (node.type !== 'Identifier' || node.name !== candidate.identifier.name) return
    if (node === candidate.identifier || contains(candidate.functionNode, node)) return
    if (!parent || isTypeOnlyReference(node)) return
    count += 1
  })
  return count
}

export default {
  create(context: Context) {
    return {
      'Program:exit'(program: Node) {
        const { candidates, exportedNames } = collectTopLevelCandidates(program)
        for (const candidate of candidates) {
          if (exportedNames.has(candidate.identifier.name)) continue
          if (!isTrivialFunction(candidate.functionNode)) continue

          const count = countExternalReferences(program, candidate)
          if (count >= MIN_REFERENCES) continue

          const name = candidate.identifier.name
          context.report({
            message: `Trivial function \`${name}\` has ${count} external references (minimum ${MIN_REFERENCES}). Inline it or give the abstraction a broader role. (tasky::no-trivial-functions)`,
            node: candidate.reportNode
          })
        }
      }
    }
  }
}
