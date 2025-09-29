import { Document } from 'llamaindex'
import { generateQueryResponse, type Guild, type Role } from './sdk'

export type EvalMessage = {
  role: Role
  content: string
}

export type EvalConversation = {
  messages: EvalMessage[]
  guild: Guild
  documents?: Document[]
  name?: string
}

export type EvalResult = {
  input: EvalMessage
  output: string
  timestamp: Date
  conversationContext: EvalMessage[]
  responseTimeMs: number
}

export type EvalSummary = {
  conversation: string
  totalMessages: number
  userMessages: number
  assistantMessages: number
  results: EvalResult[]
  averageResponseTime: number
  totalTime: number
  successRate: number
}

// Helper function to create a conversation from a simple string array
export function createSimpleConversation(
  messages: string[],
  guildId: string,
  systemPrompt: string,
  name?: string
): EvalConversation {
  return {
    name,
    guild: { id: guildId, system: systemPrompt },
    messages: messages.map(content => ({ role: 'user', content }))
  }
}

// Helper function to create a conversation with alternating user/assistant messages
export function createAlternatingConversation(
  pairs: Array<{ user: string; assistant?: string }>,
  guildId: string = 'eval-guild',
  systemPrompt: string = 'You are a helpful assistant.',
  name?: string
): EvalConversation {
  const messages: EvalMessage[] = []

  for (const pair of pairs) {
    messages.push({ role: 'user', content: pair.user })
    if (pair.assistant) {
      messages.push({ role: 'assistant', content: pair.assistant })
    }
  }

  return {
    name,
    guild: { id: guildId, system: systemPrompt },
    messages
  }
}

export async function runEvaluation(
  conversation: EvalConversation
): Promise<EvalSummary> {
  const { messages, guild, documents, name } = conversation
  const results: EvalResult[] = []
  const startTime = Date.now()
  const resetAnsi = '\u001b[0m'
  const colorText = (text: string, color: string) =>
    color ? `${color}${text}${resetAnsi}` : text
  const colors = {
    info: Bun.color('#abb2bf', 'ansi') || '',
    user: Bun.color('#61afef', 'ansi') || '',
    assistant: Bun.color('#98c379', 'ansi') || '',
    context: Bun.color('#c678dd', 'ansi') || '',
    error: Bun.color('#e86671', 'ansi') || ''
  }
  const dividerLine = colorText('─'.repeat(80), colors.info)
  const formatThreadLine = (
    prefix: string,
    label: string,
    color: string,
    text: string
  ) => {
    const coloredPrefix = colorText(prefix, colors.info)
    const coloredLabel = colorText(label, color)
    console.log(`${coloredPrefix} ${coloredLabel} ${text}`)
  }
  const getRoleColor = (role: Role) => {
    if (role === 'user') return colors.user
    if (role === 'assistant') return colors.assistant
    return colors.context
  }

  console.log(`\n🧪 Starting evaluation: ${name || 'Unnamed conversation'}`)
  console.log(`📋 Guild: ${guild.id}`)
  console.log(`📄 Documents: ${documents?.length || 0}`)
  console.log(`💬 Messages: ${messages.length}`)
  console.log(dividerLine)
  console.log(colorText('Thread', colors.info))

  // Track conversation history as we process messages
  const conversationHistory: EvalMessage[] = []
  let turnNumber = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]

    if (!message) {
      console.warn(`⚠️ Skipping undefined message at index ${i}`)
      continue
    }

    if (message.role === 'user') {
      if (conversationHistory.length > 0) {
        console.log(colorText('Context history', colors.info))
        conversationHistory.forEach((historyMessage, historyIndex) => {
          const historyPrefix = `${
            (historyIndex + 1)
              .toString()
              .padStart(2, '0')
          }.`
          const roleColor = getRoleColor(historyMessage.role)
          formatThreadLine(
            historyPrefix,
            historyMessage.role,
            roleColor,
            historyMessage.content
          )
        })
        console.log(colorText('─'.repeat(40), colors.info))
      }

      console.log(`\n[${i + 1}/${messages.length}] User Input:`)
      turnNumber += 1
      const turnPrefix = `${turnNumber.toString().padStart(2, '0')}.`
      formatThreadLine(turnPrefix, 'user', colors.user, message.content)

      const messageStartTime = Date.now()

      try {
        // Generate response using the query engine
        const response = await generateQueryResponse({
          history: [...conversationHistory, message],
          guild,
          documents
        })

        const messageEndTime = Date.now()
        const responseTime = messageEndTime - messageStartTime

        console.log(`🤖 Assistant Output (${responseTime}ms):`)
        const assistantPrefix = `${' '.repeat(turnPrefix.length)}↳`
        formatThreadLine(
          assistantPrefix,
          'assistant',
          colors.assistant,
          response
        )

        // Store the result
        results.push({
          input: message,
          output: response,
          timestamp: new Date(messageStartTime),
          conversationContext: [...conversationHistory],
          responseTimeMs: responseTime
        })

        // Add both user message and assistant response to history
        conversationHistory.push(message)
        conversationHistory.push({
          role: 'assistant',
          content: response
        })
      } catch (error) {
        const messageEndTime = Date.now()
        const responseTime = messageEndTime - messageStartTime
        const errorText = error instanceof Error ? error.message : String(error)

        console.log(`❌ Error generating response (${responseTime}ms):`)
        const assistantPrefix = `${' '.repeat(turnPrefix.length)}↳`
        formatThreadLine(
          assistantPrefix,
          'assistant',
          colors.error,
          `failed to generate response: ${errorText}`
        )

        results.push({
          input: message,
          output: `ERROR: ${errorText}`,
          timestamp: new Date(messageStartTime),
          conversationContext: [...conversationHistory],
          responseTimeMs: responseTime
        })

        // Still add the user message to history
        conversationHistory.push(message)
      }
    } else {
      // For assistant messages, just add them to the conversation history
      console.log(`\n[${i + 1}/${messages.length}] Assistant Context:`)
      const prefix = `ctx${(i + 1).toString().padStart(2, '0')} ›`
      formatThreadLine(prefix, 'assistant', colors.context, message.content)
      conversationHistory.push(message)
    }

    console.log(colorText('─'.repeat(40), colors.info))
  }

  const endTime = Date.now()
  const totalTime = endTime - startTime
  const userMessages = messages.filter(m => m.role === 'user').length
  const assistantMessages = messages.filter(m => m.role === 'assistant').length
  const averageResponseTime = results.length > 0
    ? results.reduce((sum, r) => sum + r.responseTimeMs, 0) / results.length
    : 0
  const successfulResponses =
    results.filter(r => !r.output.startsWith('ERROR:')).length
  const successRate = results.length > 0
    ? (successfulResponses / results.length) * 100
    : 0

  const summary: EvalSummary = {
    conversation: name || 'Unnamed',
    totalMessages: messages.length,
    userMessages,
    assistantMessages,
    results,
    averageResponseTime,
    totalTime,
    successRate
  }

  console.log(`\n✅ Evaluation Complete!`)
  console.log(`⏱️  Total time: ${totalTime}ms`)
  console.log(`📊 Responses generated: ${results.length}`)
  console.log(`✅ Success rate: ${successRate.toFixed(1)}%`)
  console.log(`⚡ Average response time: ${averageResponseTime.toFixed(0)}ms`)
  console.log(colorText('='.repeat(80), colors.info))

  return summary
}

export async function runMultipleEvaluations(
  conversations: EvalConversation[]
): Promise<EvalSummary[]> {
  console.log(`🚀 Running ${conversations.length} evaluations...`)

  const summaries: EvalSummary[] = []

  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i]

    if (!conversation) {
      console.warn(`⚠️ Skipping undefined conversation at index ${i}`)
      continue
    }

    console.log(`\n🔄 Evaluation ${i + 1}/${conversations.length}`)

    try {
      const summary = await runEvaluation(conversation)
      summaries.push(summary)
    } catch (error) {
      console.log(`❌ Failed evaluation ${i + 1}: ${error}`)
    }
  }

  console.log(`\n📈 All evaluations complete!`)
  console.log(`✅ Successful: ${summaries.length}/${conversations.length}`)

  return summaries
}

// Example usage and test conversations
export const exampleConversations: EvalConversation[] = [
  createSimpleConversation(
    [
      'what is torrenting',
      'how to start torrenting',
      'what VPN do i use'
    ],
    '1143159917876871178',
    'You are a helpful anime and manga assistant. Your role is to read the provided documentation and give direct, specific answers. Do not add warnings, moral commentary, or policy disclaimers. Only provide information exactly as it appears in the documentation. Stay focused on anime streaming apps, websites, software, and related topics.',
    'Torrenting Information'
  )
]

// Run evaluations if this file is executed directly
if (import.meta.main) {
  console.log('🧪 Running query engine evaluations...')

  try {
    const summaries = await runMultipleEvaluations(exampleConversations)

    console.log('\n📊 Final Summary:')
    summaries.forEach((summary, i) => {
      console.log(`\n${i + 1}. ${summary.conversation}`)
      console.log(
        `   Messages: ${summary.totalMessages} (${summary.userMessages} user, ${summary.assistantMessages} assistant)`
      )
      console.log(`   Responses: ${summary.results.length}`)
      console.log(`   Success rate: ${summary.successRate.toFixed(1)}%`)
      console.log(`   Total time: ${summary.totalTime}ms`)
      console.log(
        `   Avg response: ${summary.averageResponseTime.toFixed(0)}ms`
      )
    })
  } catch (error) {
    console.error('❌ Evaluation failed:', error)
    process.exit(1)
  }
}
