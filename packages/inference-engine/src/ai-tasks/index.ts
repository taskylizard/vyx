import env from '@packages/env'
import { velvet } from '../velvet'

export type AITaskResponse = {
  text?: string
  dict?: {
    text?: Array<{
      step_type?: string
      content?: {
        answer?: string
      }
    }>
  }
}

export type GenerateAITaskParams = {
  instructions: string
  currentDateTime: string
  timezone?: string
  userId?: string
  guildId?: string
  username?: string
  guildName?: string
}

export async function generateAITaskContent({
  instructions,
  currentDateTime,
  timezone,
  userId,
  guildId,
  username,
  guildName
}: GenerateAITaskParams) {
  const timezoneInfo = timezone ? ` (in ${timezone} timezone)` : ''
  const prompt = `Current date and time: ${currentDateTime}${timezoneInfo}

Task instructions: ${instructions}

Please provide a helpful response based on these instructions. Be concise but informative.`

  return await velvet.POST('/generate', {
    params: {
      header: {
        authorization: `Bearer ${env.INFERENCE_TOKEN}`
      }
    },
    body: {
      app: 'kanikou',
      mode: 'auto',
      prompt,
      sources: ['web'],
      userId,
      guildId,
      username,
      guildName
    }
  })
}
