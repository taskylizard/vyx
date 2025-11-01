import env from '@packages/env'
import { velvet } from '../velvet'
import type { operations } from '../velvet/generated'

type GenerateImageParams = Exclude<
  operations['postGenerate-image']['requestBody']['content'][
    'application/json'
  ],
  'app'
>

export async function generateImage({
  prompt,
  model,
  style,
  userId,
  guildId,
  username,
  guildName
}: GenerateImageParams) {
  return await velvet.POST('/generate-image', {
    params: {
      header: {
        authorization: `Bearer ${env.INFERENCE_TOKEN}`
      }
    },
    body: {
      app: 'kanikou',
      model,
      style,
      prompt,
      userId,
      guildId,
      username,
      guildName
    }
  })
}
