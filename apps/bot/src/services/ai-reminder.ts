import { generateVelvetText, jsonrepair } from '@packages/inference-engine'

export interface ParsedReminder {
  title: string
  timeOffset: number | null // milliseconds from now
  recurrence?: 'daily' | 'weekly' | 'monthly' | null
}

export interface ReminderSummary {
  total: number
  summary: string
}

/**
 * Parse natural language input into structured reminder data
 */
export async function parseNaturalLanguageReminder(
  input: string,
  userInfo?: {
    userId?: string
    guildId?: string
    username?: string
    guildName?: string
  }
): Promise<ParsedReminder | null> {
  const systemPrompt =
    `You are a helpful assistant that parses natural language reminder requests into structured data.

Given a natural language reminder input, extract the following information and respond with ONLY a JSON object:

{
  "title": "The main reminder content/task",
  "timeOffset": number in milliseconds from now (null if no specific time mentioned),
  "recurrence": "daily" | "weekly" | "monthly" | null
}

Examples:
- "remind me to call mom tomorrow evening" → {"title": "call mom", "timeOffset": 79200000, "recurrence": null}
- "take medication every day at 8pm" → {"title": "take medication", "timeOffset": 43200000, "recurrence": "daily"}
- "meeting with team in 2 hours" → {"title": "meeting with team", "timeOffset": 7200000, "recurrence": null}

Current time context: ${new Date().toISOString()}
Be precise with time calculations and always return valid JSON. Do not use emojis in your response.`

  try {
    const response = await generateVelvetText(
      input,
      systemPrompt,
      userInfo
    )

    if (!response.data?.ok || !response.data.output) {
      return null
    }

    // Try to parse the JSON response with repair
    const cleanResponse = response.data.output.trim()

    try {
      // First try to extract JSON block if it exists
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : cleanResponse

      // Use jsonrepair to fix any JSON issues
      const repairedJson = jsonrepair(jsonText)
      if (!repairedJson) {
        console.error('JSON repair failed - returned null/undefined')
        return null
      }

      const parsed = JSON.parse(repairedJson) as ParsedReminder

      // Validate the parsed response
      if (typeof parsed.title !== 'string' || parsed.title.length === 0) {
        return null
      }

      return parsed
    } catch (parseError) {
      console.error('Failed to parse JSON even after repair:', parseError)
      return null
    }
  } catch (error) {
    console.error('Failed to parse natural language reminder:', error)
    return null
  }
}

/**
 * Generate smart summary of user reminders
 */
export async function generateReminderSummary(
  reminders: Array<{ content: string; time: Date }>,
  userInfo?: {
    userId?: string
    guildId?: string
    username?: string
    guildName?: string
  }
): Promise<ReminderSummary | null> {
  if (reminders.length === 0) {
    return {
      total: 0,
      summary: 'You have no upcoming reminders.'
    }
  }

  const reminderList = reminders.map((r, i) =>
    `${i + 1}. "${r.content}" (due: ${r.time.toISOString()})`
  ).join('\n')

  const systemPrompt =
    `You are a helpful assistant that analyzes reminder lists.

Given a list of reminders, provide a helpful summary. Respond with ONLY a JSON object:

{
  "total": number,
  "summary": "A friendly 1-2 sentence summary of what the user has coming up"
}

Make the summary conversational and helpful. Do not use emojis in your response.

Current time: ${new Date().toISOString()}`

  try {
    const response = await generateVelvetText(
      `Analyze these reminders:\n${reminderList}`,
      systemPrompt,
      userInfo
    )

    if (!response.data?.ok || !response.data.output) {
      return null
    }

    const cleanResponse = response.data.output.trim()

    try {
      // First try to extract JSON block if it exists
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : cleanResponse

      // Use jsonrepair to fix any JSON issues
      const repairedJson = jsonrepair(jsonText)
      if (!repairedJson) {
        console.error('JSON repair failed - returned null/undefined')
        return null
      }

      const parsed = JSON.parse(repairedJson) as ReminderSummary

      return parsed
    } catch (parseError) {
      console.error(
        'Failed to parse summary JSON even after repair:',
        parseError
      )
      return null
    }
  } catch (error) {
    console.error('Failed to generate reminder summary:', error)
    return null
  }
}

/**
 * Parse rescheduling intent from user input
 */
export async function parseReschedulingIntent(
  input: string,
  currentReminderContent: string,
  userInfo?: {
    userId?: string
    guildId?: string
    username?: string
    guildName?: string
  }
): Promise<{ delay: number; message: string } | null> {
  const systemPrompt =
    `You are a helpful assistant that interprets rescheduling requests for reminders.

Given user input about postponing a reminder, determine the new delay and provide a friendly response.
Respond with ONLY a JSON object:

{
  "delay": number in milliseconds from now,
  "message": "A friendly message explaining when the reminder will fire"
}

Common patterns:
- "not now" / "later" → 1 hour (3600000 ms)
- "in 30 minutes" → 30 minutes (1800000 ms)
- "tomorrow" → 24 hours (86400000 ms)
- "this evening" → until 6 PM today or next day
- "next week" → 7 days (604800000 ms)

Do not use emojis in your response.

Current time: ${new Date().toISOString()}
Original reminder: "${currentReminderContent}"`

  try {
    const response = await generateVelvetText(
      input,
      systemPrompt,
      userInfo
    )

    if (!response.data?.ok || !response.data.output) {
      return null
    }

    const cleanResponse = response.data.output.trim()

    try {
      // First try to extract JSON block if it exists
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : cleanResponse

      // Use jsonrepair to fix any JSON issues
      const repairedJson = jsonrepair(jsonText)
      if (!repairedJson) {
        console.error('JSON repair failed - returned null/undefined')
        return null
      }

      const parsed = JSON.parse(repairedJson) as {
        delay: number
        message: string
      }

      // Validate delay is reasonable (between 1 minute and 1 year)
      if (parsed.delay < 60000 || parsed.delay > 31536000000) {
        return null
      }

      return parsed
    } catch (parseError) {
      console.error(
        'Failed to parse rescheduling JSON even after repair:',
        parseError
      )
      return null
    }
  } catch (error) {
    console.error('Failed to parse rescheduling intent:', error)
    return null
  }
}
