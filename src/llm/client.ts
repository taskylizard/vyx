import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import { getKanikouModel } from '../config/model.ts'
import type { KanikouEnv } from '../config/env.ts'

export function createKanikouModel(config: KanikouEnv): LanguageModel {
  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
    appName: 'kanikou',
    compatibility: 'strict'
  })

  return openrouter.chat(getKanikouModel())
}
