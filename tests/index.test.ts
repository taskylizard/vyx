import { expect, test } from 'vite-plus/test'
import { KANIKOU_CLARIFICATION_POLICY, kanikouSystemPrompt } from '../src/index.ts'

test('embeds the current UTC date in the system prompt', () => {
  expect(kanikouSystemPrompt(new Date('2026-07-09T12:34:56.000Z'))).toContain(
    'Current UTC date: 2026-07-09.'
  )
})

test('asks for clarification only when missing details change execution', () => {
  expect(KANIKOU_CLARIFICATION_POLICY).toContain('materially change the tool, source, or answer')
  expect(KANIKOU_CLARIFICATION_POLICY).toContain('Do not ask about optional details')
  expect(kanikouSystemPrompt()).toContain(KANIKOU_CLARIFICATION_POLICY)
})
