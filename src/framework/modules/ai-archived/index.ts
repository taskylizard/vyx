import { customProvider } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import type { Client } from '#framework'
import type { ArrayElement } from '../types'
import type { CloudflareTextGenerationModel } from './cloudflare'
import {
  type HuggingfaceModel,
  huggingfaceInferenceClient
} from './huggingface'
export type TextProviderKey = 'cloudflare'
export type ModelMode = 'performance' | 'quality'

export type TextProviders = {
  cloudflare: CloudflareTextGenerationModel[]
  huggingface: HuggingfaceModel[]
}

export const TEXT_PROVIDERS: TextProviders = {
  cloudflare: [
    '@cf/mistral/mistral-7b-instruct-v0.1',
    '@cf/meta/llama-2-7b-chat-int8',
    '@cf/meta/llama-3-8b-instruct' // Fixed the duplicate
  ],
  huggingface: ['google/gemma-2b']
}

type ProviderModelMap = {
  [K in keyof TextProviders]: ArrayElement<TextProviders[K]>
}

export const TEXT_MODEL_CONFIGS: Record<ModelMode, ProviderModelMap> = {
  performance: {
    cloudflare: '@cf/meta/llama-2-7b-chat-int8',
    huggingface: 'google/gemma-2b'
  },
  quality: {
    cloudflare: '@cf/meta/llama-3-8b-instruct',
    huggingface: 'google/gemma-2b'
  }
}

export const TEXT_PROVIDER_ORDER: TextProviderKey[] = ['cloudflare']

export const initializeProviderRecord = <T>(defaultValue?: T) =>
  Object.fromEntries(
    TEXT_PROVIDER_ORDER.map((key) => [key, defaultValue])
  ) as Record<TextProviderKey, T>

export const createProviders = (client: Client) => ({
  cloudflare: createWorkersAI({
    accountId: client.env.CLOUDFLARE_AI_ACCOUNT_ID,
    apiKey: client.env.CLOUDFLARE_AI_API_KEY
  }),
  huggingface: huggingfaceInferenceClient(client)
})
