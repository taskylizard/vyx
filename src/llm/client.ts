import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import { KANIKOU_MODEL_SETTINGS } from '../config/model.ts'
import type { KanikouEnv } from '../config/env.ts'

export function createKanikouModel(config: KanikouEnv): LanguageModel {
  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
    appName: 'kanikou',
    compatibility: 'strict'
  })

  return openrouter.chat(KANIKOU_MODEL_SETTINGS.model)
}
