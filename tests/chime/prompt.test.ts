import { expect, test } from 'vite-plus/test'
import { buildChimePrompt, isChimeSkip } from '../../src/chime/prompt.ts'
import type { ChimeObservation } from '../../src/chime/types.ts'

function observation(id: string, authorName: string, content: string): ChimeObservation {
  return {
    authorID: `user-${id}`,
    authorName,
    content,
    id,
    timestamp: 1_750_000_000_000
  }
}

test('formats observations as chat-style user messages', () => {
  const prompt = buildChimePrompt([
    observation('m1', 'alice', 'types are just vibes with compile errors'),
    observation('m2', 'bob', 'lmao true')
  ])

  expect(prompt.messages).toEqual([
    { content: 'alice (ID: user-m1): types are just vibes with compile errors', role: 'user' },
    { content: 'bob (ID: user-m2): lmao true', role: 'user' }
  ])
  expect(prompt.instructions).toContain('ONE short remark')
})

test('keeps only the most recent messages for the prompt', () => {
  const observations = Array.from({ length: 20 }, (_, index) =>
    observation(`m${index}`, 'alice', `message ${index}`)
  )

  const prompt = buildChimePrompt(observations)

  expect(prompt.messages).toHaveLength(12)
  expect(prompt.messages.at(0)).toEqual({
    content: 'alice (ID: user-m8): message 8',
    role: 'user'
  })
  expect(prompt.messages.at(-1)).toEqual({
    content: 'alice (ID: user-m19): message 19',
    role: 'user'
  })
})

test('detects the skip sentinel loosely but not regular replies', () => {
  expect(isChimeSkip('skip')).toBe(true)
  expect(isChimeSkip('  SKIP \n')).toBe(true)
  expect(isChimeSkip('skipped that one')).toBe(false)
  expect(isChimeSkip('honestly same')).toBe(false)
})
