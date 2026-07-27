import { defineConfig } from 'vite-plus'
import oxclippyRecommended from './tooling/oxlint/presets/recommended.ts'

export default defineConfig({
  pack: {
    dts: false,
    entry: ['src/run.ts']
  },
  lint: {
    ignorePatterns: ['rosepack/**'],
    categories: {
      perf: 'error'
    },
    jsPlugins: ['./tooling/oxlint/plugin.ts'],
    extends: [oxclippyRecommended],
    options: {
      typeAware: true,
      typeCheck: true
    }
  },
  staged: {
    '*': 'vp check --fix'
  },
  fmt: {
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
