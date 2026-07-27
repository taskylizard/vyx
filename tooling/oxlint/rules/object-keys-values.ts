// clippy principle: "don't reinvent the standard library"
// Detects: Object.keys(obj).map(k => obj[k]) → Object.values(obj)
// Detects: Object.keys(obj).forEach(k => use(obj[k])) when only value is used → Object.values(obj)
// Analogous to Clippy's for_kv_map (iterating kv pairs when only one is needed).

import type { Context, Node } from '../types.ts'
import { isCallOf } from '../types.ts'

export default {
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return

        const methodName = callee.property
        if (methodName?.type !== 'Identifier') return
        if (methodName.name !== 'map' && methodName.name !== 'forEach') return

        // Check: Object.keys(obj).map/forEach(...)
        const receiver = callee.object
        if (!isCallOf(receiver, 'Object', 'keys')) return
        if (!receiver.arguments || receiver.arguments.length !== 1) return

        const objArg = receiver.arguments[0]!
        if (objArg.type !== 'Identifier') return
        const objName = objArg.name

        // Check callback: k => expr using obj[k]
        const args = node.arguments
        if (!args || args.length !== 1) return
        const callback = args[0]!

        if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')
          return
        if (callback.params.length !== 1) return
        const param = callback.params[0]!
        if (param.type !== 'Identifier') return
        const keyName = param.name

        // Check if callback body contains obj[key] — if so, suggest Object.values or Object.entries
        const bodyStr = context.sourceCode.text.slice(callback.body.start, callback.body.end)

        // Simple heuristic: if the callback references obj[key], suggest Object.values/entries
        const indexPattern = `${objName}[${keyName}]`
        if (bodyStr.includes(indexPattern)) {
          // Check if key is ALSO used independently (not just as obj[key])
          // Simple heuristic: count occurrences of keyName outside obj[keyName]
          const stripped = bodyStr.replace(new RegExp(`${objName}\\[${keyName}\\]`, 'g'), '')
          const keyStillUsed = new RegExp(`\\b${keyName}\\b`).test(stripped)

          if (keyStillUsed) {
            context.report({
              message: `Object keys+values: \`Object.keys(${objName}).${methodName.name}(${keyName} => ... ${objName}[${keyName}] ...)\` can use \`Object.entries(${objName})\` for clearer access to both key and value. (clippy: for_kv_map)`,
              node
            })
          } else {
            context.report({
              message: `Object keys→values: \`Object.keys(${objName}).${methodName.name}(${keyName} => ... ${objName}[${keyName}] ...)\` can be simplified to \`Object.values(${objName}).${methodName.name}(...)\`. (clippy: for_kv_map)`,
              node
            })
          }
        }
      }
    }
  }
}
