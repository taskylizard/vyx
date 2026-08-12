import { expect, test } from 'vite-plus/test'
import {
  formatCompletedResponse,
  formatThinkingProgress,
  stripToolsFooter,
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

test('does not duplicate a tools footer already echoed by the model', () => {
  expect(formatCompletedResponse('Final answer\n-# Tools: Search', ['search'])).toBe(
    'Final answer\n-# Tools: Search'
  )
  expect(formatCompletedResponse('Final answer\n-# Tools: Search', ['search', 'search'])).toBe(
    'Final answer\n-# Tools: Search (x2)'
  )
})

test('strips consecutive echoed footer lines before appending the canonical footer', () => {
  expect(stripToolsFooter('Final answer\n-# Tools: Search\n-# Tools: Search')).toBe('Final answer')
  expect(stripToolsFooter('Final answer\n-# Tools: Search')).toBe('Final answer')
  expect(stripToolsFooter('-# Tools: Search')).toBe('')
  expect(stripToolsFooter('Final answer')).toBe('Final answer')
  expect(stripToolsFooter('Final answer\n-# Tools: Search\nmore content')).toBe(
    'Final answer\n-# Tools: Search\nmore content'
  )
})
