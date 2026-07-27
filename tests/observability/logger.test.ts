import { expect, test, vi } from 'vite-plus/test'
import { createConsoleLogger } from '../../src/observability/logger.ts'

test('uses the console reporter locally with level filtering and redaction', () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  try {
    const logger = createConsoleLogger('INFO')

    logger.debug('hidden debug event')
    logger.info('visible event', {
      inputTokens: 42,
      nested: { authorization: 'secret-header', value: 42 },
      token: 'secret-token'
    })

    expect(debug).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledOnce()
    expect(info.mock.calls[0]?.[2]).toEqual({
      inputTokens: 42,
      nested: { authorization: '[redacted]', value: 42 },
      token: '[redacted]'
    })
  } finally {
    info.mockRestore()
    debug.mockRestore()
  }
})
