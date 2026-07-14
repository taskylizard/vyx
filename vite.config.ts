import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: false,
    entry: ['src/run.ts']
  },
  lint: {
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
    typecheck: {
      enabled: true
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
        dependsOn: ['rosepack#build'],
        input: [{ auto: true }, '!dist/**'],
        output: ['dist/**']
      },
      check: {
        command: 'vp check',
        dependsOn: ['rosepack#build'],
        output: []
      },
      test: {
        command: 'vp test',
        dependsOn: ['rosepack#build'],
        output: []
      }
    }
  }
})
