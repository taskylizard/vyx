import { expect, test } from 'vite-plus/test'
import { formatCitations } from '../../src/llm/citations.ts'

test('converts markdown links to numbered Discord citations', () => {
  expect(
    formatCitations(
      'Alpha [source](https://example.com/a) and again [source](https://example.com/a). Beta [ref](https://example.com/b).'
    )
  ).toBe(
    'Alpha [[1]](<https://example.com/a>) and again [[1]](<https://example.com/a>). Beta [[2]](<https://example.com/b>).'
  )
})

test('suppresses embeds for pre-wrapped and double-digit citations', () => {
  const links = Array.from(
    { length: 11 },
    (_, index) => `[source](https://example.com/${index + 1})`
  ).join(' ')

  expect(formatCitations(`[source](<https://example.com/wrapped>) ${links}`)).toBe(
    '[[1]](<https://example.com/wrapped>) ' +
      Array.from(
        { length: 11 },
        (_, index) => `[[${index + 2}]](<https://example.com/${index + 1}>)`
      ).join(' ')
  )
})
