import { generateAITaskContent } from './index'
import type { GenerateAITaskParams } from './index'

const testInstructions = [
  "What are today's most important tech news headlines?",
  'Give me a daily weather summary and what I should wear today.',
  'Summarize the latest developments in AI and machine learning.'
]

const mockCurrentDateTime = 'Wednesday, October 16th, 2024 at 9:00 AM EST'
const mockTimezone = 'America/New_York'

for (const instructions of testInstructions) {
  const params: GenerateAITaskParams = {
    instructions,
    currentDateTime: mockCurrentDateTime,
    timezone: mockTimezone,
    userId: 'test-user-123',
    guildId: undefined,
    username: 'TestUser',
    guildName: undefined
  }

  console.log('---')
  console.log(`Instructions: ${instructions}`)
  console.log(`Current DateTime: ${mockCurrentDateTime}`)
  console.log(`Timezone: ${mockTimezone}`)

  try {
    const result = await generateAITaskContent(params)

    if (!result.data) {
      console.error('No data returned from AI task generation')
      continue
    }

    // Extract content from response (similar to scheduler logic)
    let content = result.data.text
    if (
      !content && result.data.dict && typeof result.data.dict === 'object' &&
      'text' in result.data.dict
    ) {
      const dictText = (result.data.dict as any).text
      if (Array.isArray(dictText)) {
        const textSteps = dictText.filter((step: any) =>
          step && typeof step === 'object' && step.step_type === 'text'
        )
        if (textSteps.length > 0) {
          const firstStep = textSteps[0] as any
          if (firstStep.content && typeof firstStep.content === 'object') {
            content = firstStep.content.answer
          }
        }
      }
    }

    if (content) {
      console.log('Generated content:')
      console.log(content)
    } else {
      console.log('No content extracted from response')
      console.log('Raw response:', JSON.stringify(result.data, null, 2))
    }
  } catch (error) {
    console.error('Error generating AI task content:', error)
  }
}
