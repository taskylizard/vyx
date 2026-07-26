import { expect, test } from 'vite-plus/test'
import { suppressLinkEmbeds } from '../../src/llm/links.ts'

test('suppresses embeds for bare links', () => {
  expect(suppressLinkEmbeds('Read https://example.com/docs and https://example.com/api.')).toBe(
    'Read <https://example.com/docs> and <https://example.com/api>.'
  )
})

test('preserves links that are already suppressed', () => {
  expect(suppressLinkEmbeds('Read <https://example.com/?next=https://docs.example.com>.')).toBe(
    'Read <https://example.com/?next=https://docs.example.com>.'
  )
})

test('keeps balanced URL delimiters inside the suppressed link', () => {
  expect(
    suppressLinkEmbeds('Compare https://en.wikipedia.org/wiki/Type_theory_(computer_science).')
  ).toBe('Compare <https://en.wikipedia.org/wiki/Type_theory_(computer_science)>.')
})

test('keeps surrounding Markdown link delimiters outside the suppressed URL', () => {
  expect(suppressLinkEmbeds('[Documentation](https://example.com/docs)')).toBe(
    '[Documentation](<https://example.com/docs>)'
  )
})
