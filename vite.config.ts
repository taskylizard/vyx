import { defineConfig } from 'vite-plus'
import lintConfig from './tooling/oxlint/config.ts'

export default defineConfig({
  pack: {
    dts: false,
    entry: ['src/run.ts']
  },
  lint: {
    ignorePatterns: ['rosepack/**', 'dist/**', 'coverage/**'],
    env: {
      builtin: true,
      node: true
    },
    plugins: ['unicorn', 'typescript', 'oxc', 'import', 'node', 'promise'],
    categories: {
      correctness: 'error',
      perf: 'error',
      suspicious: 'warn'
    },
    jsPlugins: ['./tooling/oxlint/plugin.ts'],
    extends: [lintConfig],    options: {
      reportUnusedDisableDirectives: 'warn',
      typeAware: true,
      typeCheck: true
    }
  },
  staged: {
    '*': 'vp check --fix'
  },
  fmt: {
    ignorePatterns: ['rosepack/**', 'dist/**', 'coverage/**'],
    quoteProps: 'preserve',
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    tabWidth: 2,
    jsxSingleQuote: true
  },
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', 'rosepack/**'],
    typecheck: {
      enabled: true,
      exclude: ['**/node_modules/**', '**/.git/**', 'rosepack/**']
    }
  },
  run: {
    cache: {
      scripts: false,
      tasks: true
    },
    tasks: {
      build: {
        command: 'vp pack',
        input: [{ auto: true }, '!dist/**', '!rosepack/**'],
        output: ['dist/**']
      },
      check: {
        command: 'vp check',
        input: [{ auto: true }, '!rosepack/**'],
        output: []
      },
      test: {
        command: 'vp test',
        input: [{ auto: true }, '!rosepack/**'],
        output: []
      }
    }
  }
})
