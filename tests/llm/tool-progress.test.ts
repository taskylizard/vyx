import { expect, test } from 'vite-plus/test'
import {
  formatCompletedResponse,
  formatThinkingProgress,
  THINKING_RESPONSE
} from '../../src/llm/tool-progress.ts'

test('shows the initial thinking response without an empty tool list', () => {
  expect(formatThinkingProgress([])).toBe(THINKING_RESPONSE)
})

test('appends tool calls to thinking progress in call order', () => {
  expect(formatThinkingProgress(['search', 'extract', 'search'])).toBe(
    '*Thinking...*\n-# Tools: Search, Extract, Search'
  )
})

test('compacts consecutive repeated tool calls and updates their count', () => {
  expect(formatThinkingProgress(['search', 'search'])).toBe('*Thinking...*\n-# Tools: Search (x2)')
  expect(formatThinkingProgress(['search', 'search', 'search', 'extract'])).toBe(
    '*Thinking...*\n-# Tools: Search (x3), Extract'
  )
})

test('keeps repeated tool calls in separate runs when another tool occurs between them', () => {
  expect(formatThinkingProgress(['search', 'search', 'extract', 'search', 'search'])).toBe(
    '*Thinking...*\n-# Tools: Search (x2), Extract, Search (x2)'
  )
})

test('preserves the tool list beneath the completed response', () => {
  expect(formatCompletedResponse('Final answer', ['youtubeTranscript', 'youtubeTranscript'])).toBe(
    'Final answer\n-# Tools: YouTube Transcript (x2)'
  )
  expect(formatCompletedResponse('Final answer', [])).toBe('Final answer')
})
