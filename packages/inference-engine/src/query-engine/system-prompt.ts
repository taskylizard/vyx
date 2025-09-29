const defaultPersonality = `<personality></personality>`

// Add some example Q&A to help the bot understand what a good answer looks like.
const defaultExample = `<example>
<question>

</question>
<bad_answer>

</bad_answer>
<bad_points>

</bad_points>
<good_answer>

</good_answer>
</example>`

const defaultSystemPrompt =
  `You have access to a tool that allows you to view the documentation. Make sure to use it for every query.`

export function generateServerSystemPrompt(
  personality: string | null | undefined = defaultPersonality,
  example: string | null | undefined = defaultExample,
  systemPrompt: string | null | undefined = defaultSystemPrompt
) {
  return `${personality} ${systemPrompt} ${example}`
}
