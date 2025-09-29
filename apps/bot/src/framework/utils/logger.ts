import env from '@packages/env'
import { consola } from 'consola'
import { AxiomReporter } from './axiom-reporter'

export const logger = consola.withTag('bot')

// Add Axiom reporter for production
if (env.NODE_ENV === 'production' && env.AXIOM_TOKEN) {
  try {
    const axiomReporter = new AxiomReporter({
      token: env.AXIOM_TOKEN,
      dataset: env.AXIOM_DATASET,
      orgId: env.AXIOM_ORG_ID
    })
    logger.addReporter(axiomReporter)
    logger.debug('Axiom logging enabled')
  } catch (error) {
    logger.error('Failed to initialize Axiom logging:', error)
  }
}

export { consola }

export default logger
