export type AIResponse = {
  text?: string
  backend_uuid?: string
  web_results?: unknown[]
  citations?: Array<{
    index: number
    url: string
    name: string
    snippet: string
    domain: string
  }>
  dict?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ParsedAIAnswerPayload = {
  answer: string
  webResults: (string | undefined)[]
}

const parseAIAnswerPayload = (
  payload?: string
): ParsedAIAnswerPayload | undefined => {
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

export const formatAskAIAnswer = (data: AIResponse) => {
  if (data.dict && typeof data.dict === 'object' && 'text' in data.dict) {
    const steps = (data.dict as any).text
    if (Array.isArray(steps)) {
      const finalStep = steps.find((step: any) => step?.step_type === 'FINAL')
      if (
        finalStep && typeof finalStep === 'object' && 'content' in finalStep &&
        finalStep.content && typeof finalStep.content === 'object' &&
        'answer' in finalStep.content
      ) {
        const answerPayload = parseAIAnswerPayload(
          (finalStep.content as any).answer
        )
        if (answerPayload) {
          const { answer, webResults } = answerPayload
          const formatted = answer.replace(/\[(\d+)\]/g, (match, group) => {
            const index = Number.parseInt(group, 10) - 1
            if (Number.isNaN(index)) return match
            const url = webResults[index]
            return url ? `[[${group}]](${url})` : match
          })
          return formatted.trim()
        }
      }
    }
  }
  return data.text?.trim()
}
