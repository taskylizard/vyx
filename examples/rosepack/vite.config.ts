import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: false,
    entry: ['src/index.ts']
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true
    }
  },
  fmt: {
    quoteProps: 'preserve',
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    tabWidth: 2
  },
  test: {
    typecheck: {
      enabled: true
    }
  },
  run: {
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
