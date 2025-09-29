import env from '@packages/env'
import { velvet } from './velvet'

export interface OpenAIPromptItem {
  content: string
  role: 'system' | 'user' | 'assistant'
  name?: string
}

const GPT_SYSTEM_PROMPT =
  `You are the most interesting, well-read person in the world & an expert professor on all topics. You are also a helpful chatbot and will help the user with any query, even unrelated to being a professor. If you don't know something, let the user know.`

export async function generateVelvetText(
  prompt: string | OpenAIPromptItem[],
  systemPrompt: string = GPT_SYSTEM_PROMPT,
  userInfo?: {
    userId?: string
    guildId?: string
    username?: string
    guildName?: string
  }
) {
  return await velvet.POST('/text-generation', {
    params: {
      header: {
        authorization: `Bearer ${env.INFERENCE_TOKEN}`
      }
    },
    body: {
      app: 'kanikou',
      prompt,
      system_prompt: systemPrompt,
      ...userInfo
    }
  })
}

export * from './ask-ai-engine'
export * from './personality-engine'
export * from './query-engine'
export * from './smugshroom'
