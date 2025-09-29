import env from '@packages/env'
import createClient from 'openapi-fetch'
import type { paths } from './generated'

export const velvet = createClient<paths>({
  baseUrl: 'https://velvet.fmhy.net',
  headers: {
    'Authorization': `Bearer ${env.INFERENCE_TOKEN}`
  }
})
