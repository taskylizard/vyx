// Minimal ESTree-compatible types for oxlint JS plugin API

export interface Node {
  type: string
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } }
  // oxlint-disable-next-line typescript/no-explicit-any -- tasky: oxlint exposes parser-specific ast fields here, fake unknown types just spread casts everywhere
  [key: string]: any
}

export interface Context {
  report(descriptor: { message: string; node: Node }): void
  sourceCode: { text: string }
  filename?: string
}

export interface Rule {
  create(context: Context): Record<string, (node: Node) => void>
}

// --- Helpers ---

export function isLiteral(node: Node | null | undefined, value?: unknown): node is Node {
  if (!node || node.type !== 'Literal') return false
  return value === undefined ? true : node.value === value
}

export function isBoolLiteral(node: Node | null | undefined): node is Node {
  return isLiteral(node) && typeof node.value === 'boolean'
}

export function isIdentifier(node: Node | null | undefined, name?: string): boolean {
  if (!node || node.type !== 'Identifier') return false
  return name === undefined ? true : node.name === name
}

export function isCallOf(node: Node, object: string, method: string): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  return isIdentifier(callee.object, object) && isIdentifier(callee.property, method)
}

export function isMethodCall(node: Node, method: string): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  return (
    callee.type === 'MemberExpression' && !callee.computed && isIdentifier(callee.property, method)
  )
}

/** Unwrap a BlockStatement to its single statement, or return the statement itself */
export function unwrapBlock(node: Node | null | undefined): Node | null {
  if (!node) return null
  if (node.type === 'BlockStatement') {
    return node.body.length === 1 ? node.body[0] : null
  }
  return node
}

/** Get the body statements of a function node */
export function getFunctionBody(node: Node): Node[] | null {
  const body = node.body
  if (!body) return null
  if (body.type === 'BlockStatement') return body.body
  return null
}

/** Get the declared variable name from a ForOfStatement */
export function getForOfVar(node: Node): string | null {
  const left = node.left
  if (left.type === 'VariableDeclaration' && left.declarations.length === 1) {
    const decl = left.declarations[0]
    if (decl.id && decl.id.type === 'Identifier') return decl.id.name
  }
  return null
}
