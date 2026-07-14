import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: {
      tsgo: true
    },
    exports: true
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
        input: [{ auto: true }, '!dist/**'],
        output: ['dist/**']
      },
      check: {
        command: 'vp check',
        output: []
      },
      test: {
        command: 'vp test',
        output: []
      }
    }
  }
})
