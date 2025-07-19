/// <reference types="@cloudflare/workers-types" />
import type { Value2key } from '../types'

export type CloudflareTextGenerationModel = Exclude<
  // biome-ignore lint/correctness/noUndeclaredVariables: don't care
  Value2key<AiModels, BaseAiTextGeneration>,
  // biome-ignore lint/correctness/noUndeclaredVariables: don't care
  Value2key<AiModels, BaseAiTextToImage>
> // This needs to be fixed to allow more models
export type CloudflareImageGenerationModel = Value2key<
  // biome-ignore lint/correctness/noUndeclaredVariables: don't care
  AiModels,
  // biome-ignore lint/correctness/noUndeclaredVariables: don't care
  BaseAiTextToImage
>
//  biome-ignore lint/correctness/noUndeclaredVariables: don't care
export type CloudflareEmbeddingModel = Value2key<AiModels, BaseAiTextEmbeddings>
