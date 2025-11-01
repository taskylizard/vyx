import env from '@packages/env'
import type { OpenAIPromptItem } from '../'
import { velvet } from '../velvet'

export type AskAIInteractionType = 'mention' | 'reply'

export type AskAIAnswerStep = {
  step_type?: string
  content?: {
    answer?: string
  }
}

export type AskAIResponse = {
  text?: string
  dict?: {
    text?: AskAIAnswerStep[]
  }
}

export type GenerateAskAIResponseParams = {
  systemPrompt: string
  context: OpenAIPromptItem[]
  interactionType: AskAIInteractionType
  formattedPrompt?: string
  userId?: string
  guildId?: string
  username?: string
  guildName?: string
  files?: File[]
}

type FormatAskAIPromptParams = Omit<
  GenerateAskAIResponseParams,
  'formattedPrompt'
>

export const formatAskAIPrompt = ({
  systemPrompt,
  context,
  interactionType
}: FormatAskAIPromptParams) => {
  const cleanedSystemPrompt = systemPrompt.trim()
  const interactionDescription = interactionType === 'reply'
    ? 'reply to a previous assistant response'
    : 'direct mention in the channel'

  const formattedContext = context
    .map(({ role, content, name }, index) => {
      const normalizedContent = content.trim()
      if (!normalizedContent) return ''
      const labelParts = [role.toUpperCase()]
      const trimmedName = name?.trim()
      if (trimmedName) labelParts.push(trimmedName)
      const label = `${index + 1}. ${labelParts.join(' - ')}`
      return `${label}\n${normalizedContent}`
    })
    .filter((value) => Boolean(value.trim()))
    .join('\n\n')

  const sections = [
    `System prompt:\n${cleanedSystemPrompt}`,
    `Interaction type: ${interactionDescription}`
  ]

  if (formattedContext) {
    sections.push(`Conversation context:\n${formattedContext}`)
  }

  return sections.join('\n\n')
}

export async function generateAskAIResponse({
  systemPrompt,
  context,
  interactionType,
  formattedPrompt,
  userId,
  guildId,
  username,
  guildName,
  files
}: GenerateAskAIResponseParams) {
  const prompt = formattedPrompt ??
    formatAskAIPrompt({ systemPrompt, context, interactionType })

  // if files are present, use FormData
  if (files && files.length > 0) {
    const formData = new FormData()
    formData.append('app', 'kanikou')
    formData.append('mode', 'auto')
    formData.append('prompt', prompt)
    formData.append('sources', 'web')
    if (userId) formData.append('userId', userId)
    if (guildId) formData.append('guildId', guildId)
    if (username) formData.append('username', username)
    if (guildName) formData.append('guildName', guildName)

    for (const file of files) {
      formData.append('files', file)
    }

    return await velvet.POST('/generate', {
      params: {
        header: {
          authorization: `Bearer ${env.INFERENCE_TOKEN}`
        }
      },
      body: formData as any,
      bodySerializer: (body) => body as any
    })
  }

  // otherwise use JSON
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
