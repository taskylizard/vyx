import consola, { type ConsolaReporter } from 'consola'

const wrapReporter = (reporter: ConsolaReporter) => {
  return {
    log: (logObj, ctx) => {
      if (!logObj.args || !logObj.args.length) return

      return reporter.log(logObj, ctx)
    }
  } satisfies ConsolaReporter
}

export const setupGlobalConsole = (opts: { dev?: boolean } = {}) => {
  consola.options.reporters = consola.options.reporters.map(wrapReporter)

  if (opts.dev) {
    consola.wrapAll()
  } else {
    consola.wrapConsole()
  }

  process.on(
    'unhandledRejection',
    (err) => consola.error('[unhandledRejection]:', err)
  )

  process.on(
    'uncaughtException',
    (err) => consola.error('[uncaughtException]:', err)
  )
}
