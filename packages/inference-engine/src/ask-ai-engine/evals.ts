import { formatAskAIAnswer, type OpenAIPromptItem } from '../index'
import { formatAskAIPrompt, generateAskAIResponse } from './index'
import type { AskAIInteractionType, AskAIResponse } from './index'

const ASK_AI_SYSTEM_PROMPT =
  'You have been asked a question within a Discord server. With this context in mind, answer the question as if you were a human. Answer using the language the prompt was written in. Do not show your own character, just reply to the prompt. Users may also be asking you a general question unrelated to the chat, in that case you may ignore the context provided. However, whenever possible take the chat context into consideration. Users may also ask questions such as "factcheck" and "is this true" and if that hapens, it is most likely that you have been tasked to evaluate a stetement made by a user in the chat. Find the statement, and see if it is true or not, giving reasons why.'

const queries = [
  "what is the general public's stance on trump?",
  'what is the capital of germany?',
  'what is the population of germany?'
]

const interactionType: AskAIInteractionType = 'mention'

const buildContext = (question: string): OpenAIPromptItem[] => [
  {
    role: 'user',
    content: question
  }
]

for (const query of queries) {
  const context = buildContext(query)
  const formattedPrompt = formatAskAIPrompt({
    systemPrompt: ASK_AI_SYSTEM_PROMPT,
    context,
    interactionType
  })

  const { data, error } = await generateAskAIResponse({
    systemPrompt: ASK_AI_SYSTEM_PROMPT,
    context,
    interactionType,
    formattedPrompt,
    userId: undefined,
    guildId: undefined,
    username: undefined,
    guildName: undefined
  })

  console.log('---')
  console.log(`Query: ${query}`)

  if (error || !data) {
    if (error) console.error('Request failed', error)
    if (!data) console.error('No data returned')
    continue
  }

  const formatted = formatAskAIAnswer(data as AskAIResponse)
  if (formatted) {
    console.log('Markdown output:')
    console.log(formatted)
  } else {
    console.log('No formatted answer available')
  }
}
