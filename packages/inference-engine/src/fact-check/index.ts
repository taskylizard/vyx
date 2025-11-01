import env from '@packages/env'
import { velvet } from '../velvet'

export type FactCheckResponse = {
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

export type GenerateFactCheckParams = {
  messageContent: string
  userId?: string
  guildId?: string
  username?: string
  guildName?: string
}

const FACT_CHECK_SYSTEM_PROMPT =
  `You are a professional fact-checker. Analyze the provided message and check the factual accuracy of any claims made. Provide a clear, objective assessment that includes:

1. Verification status of factual claims
2. Sources or context for verification (when possible)
3. Any inaccuracies or misleading information identified
4. A brief summary of your findings

Be concise but thorough. Focus on verifiable facts rather than opinions. Include web search citations where relevant.`

export async function generateFactCheck({
  messageContent,
  userId,
  guildId,
  username,
  guildName
}: GenerateFactCheckParams) {
  const prompt = `Please fact-check the following message:

"${messageContent}"

${FACT_CHECK_SYSTEM_PROMPT}`

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
