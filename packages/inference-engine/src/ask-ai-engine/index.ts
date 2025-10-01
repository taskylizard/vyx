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

type ParsedAskAIAnswerPayload = {
  answer: string
  webResults: (string | undefined)[]
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

const parseAskAIAnswerPayload = (
  payload?: string
): ParsedAskAIAnswerPayload | undefined => {
  if (!payload) return
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!isRecord(parsed)) return
    const answerValue = parsed.answer
    const answer = typeof answerValue === 'string' ? answerValue.trim() : ''
    if (!answer) return
    const webResultsValue = parsed.web_results
    const rawResults = Array.isArray(webResultsValue) ? webResultsValue : []
    const webResults = rawResults.map((entry) => {
      if (!isRecord(entry)) return undefined
      const url = entry.url
      return typeof url === 'string' && url.length > 0 ? url : undefined
    })
    return { answer, webResults }
  } catch {
    return
  }
}

export const formatAskAIAnswer = (data: AskAIResponse) => {
  const steps = data.dict?.text
  if (!Array.isArray(steps)) return data.text?.trim()
  const finalStep = steps.find((step) => step?.step_type === 'FINAL')
  const answerPayload = parseAskAIAnswerPayload(finalStep?.content?.answer)
  if (!answerPayload) return data.text?.trim()
  const { answer, webResults } = answerPayload
  const formatted = answer.replace(/\[(\d+)\]/g, (match, group) => {
    const index = Number.parseInt(group, 10) - 1
    if (Number.isNaN(index)) return match
    const url = webResults[index]
    return url ? `[[${group}]](${url})` : match
  })
  return formatted.trim()
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
