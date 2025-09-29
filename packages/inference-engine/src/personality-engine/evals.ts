console.log('Testing basic generateVelvetText function...')

const PERSONALITY_SYSTEM_PROMPT =
  'You are tasky, a helpful assistant in Discord servers.'

const queries = [
  'Hello, how are you doing today?',
  'Can you help me with a coding question?',
  'What do you think about the latest tech news?',
  'Tell me a joke',
  'What is your favorite programming language?'
]

const buildContext = (question: string) => [
  {
    role: 'user' as const,
    content: question,
    name: 'TestUser'
  }
]

// Import velvet directly to avoid personality-engine circular imports
const { velvet } = await import('../velvet/index.js')

async function generateVelvetText(
  prompt:
    | string
    | Array<
      { content: string; role: 'system' | 'user' | 'assistant'; name?: string }
    >,
  systemPrompt: string,
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
        authorization: `Bearer ${process.env.INFERENCE_TOKEN}`
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

const main = async () => {
  try {
    for (const query of queries) {
      try {
        const context = buildContext(query)

        console.log('---')
        console.log(`Query: ${query}`)

        // test basic velvet text generation
        const { data, error } = await generateVelvetText(
          context,
          PERSONALITY_SYSTEM_PROMPT,
          {
            userId: undefined,
            guildId: undefined,
            username: undefined,
            guildName: undefined
          }
        )

        if (error || !data) {
          if (error) console.error('Request failed', error)
          if (!data) console.error('No data returned')
          continue
        }

        console.log('Response:')
        console.log(data.output)
      } catch (error) {
        console.error(`Failed to process query "${query}":`, error)
      }
    }
  } catch (error) {
    console.error('Evals failed:', error)
  }
}

main().catch(console.error)
