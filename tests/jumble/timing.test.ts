import { expect, test, vi } from 'vite-plus/test'
import { emitJumbleTiming } from '../../src/jumble/timing.ts'

test('keeps timing sink failures out of the Jumble path', () => {
  const sink = vi.fn(() => {
    throw new Error('logger unavailable')
  })

  expect(() =>
    emitJumbleTiming(sink, {
      type: 'render',
      mode: 'pixelated',
      outcome: 'success',
      durationMs: 12.3,
      sourceCount: 1,
      stage: 0
    })
  ).not.toThrow()
  expect(sink).toHaveBeenCalledOnce()
})
