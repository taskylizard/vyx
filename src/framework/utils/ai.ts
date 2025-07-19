import { createWorkersAI } from 'workers-ai-provider'
import type { Ai } from '#framework'

export const providers = {
  cloudflare: (env: { ai: Ai }) => createWorkersAI({ binding: env.ai })
}

export const mainProvider = providers.cloudflare
