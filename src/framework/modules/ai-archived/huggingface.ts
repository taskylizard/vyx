import type { Client } from '@/framework/client'
import { InferenceClient } from '@huggingface/inference'

export const huggingfaceInferenceClient = (client: Client) =>
  new InferenceClient(client.env.HUGGINGFACE_API_KEY)

export const huggingfaceModels = ['google/gemma-2b'] as const
export type HuggingfaceModel = (typeof huggingfaceModels)[number]
