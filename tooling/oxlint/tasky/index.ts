// tasky - repo policy rules: forwarding functions, alias types, inline subcommands, comment hygiene
import maxCommentLength from './rules/max-comment-length.ts'
import noBullshit from './rules/no-bullshit.ts'
import noSubcommandVariables from './rules/no-subcommand-variables.ts'
import noTrivialFunctions from './rules/no-trivial-functions.ts'
import noTrivialTypeAliases from './rules/no-trivial-type-aliases.ts'

const plugin = {
  meta: {
    name: 'tasky',
    version: '0.0.0'
  },
  rules: {
    'max-comment-length': maxCommentLength,
    'no-bullshit': noBullshit,
    'no-subcommand-variables': noSubcommandVariables,
    'no-trivial-functions': noTrivialFunctions,
    'no-trivial-type-aliases': noTrivialTypeAliases
  }
}

export default plugin
