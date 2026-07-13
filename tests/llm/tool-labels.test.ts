import { expect, test } from 'vite-plus/test'
import { toolActivityLabel } from '../../src/llm/tools/tool-labels.ts'

test('uses stable labels for built-in tools', () => {
  expect(toolActivityLabel('search')).toBe('Search')
  expect(toolActivityLabel('extract')).toBe('Extract')
  expect(toolActivityLabel('youtubeTranscript')).toBe('YouTube Transcript')
})

test('humanizes labels for future tools', () => {
  expect(toolActivityLabel('local_file-reader')).toBe('Local file reader')
  expect(toolActivityLabel('')).toBe('Unknown Tool')
})
