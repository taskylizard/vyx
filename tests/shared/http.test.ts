import { expect, test } from 'vite-plus/test'
import { readBoundedBytes, readBoundedJson } from '../../src/shared/http.ts'

test('rejects non-finite response limits before reading the body', async () => {
  await expect(readBoundedBytes(new Response('payload'), Number.NaN)).rejects.toThrow(
    'Response byte limit must be finite.'
  )
  await expect(readBoundedBytes(new Response('payload'), Number.POSITIVE_INFINITY)).rejects.toThrow(
    'Response byte limit must be finite.'
  )
})

test('bounds streamed response bodies and parses bounded JSON', async () => {
  await expect(readBoundedBytes(new Response('payload'), 3)).rejects.toThrow(
    'Response exceeded the safety limit.'
  )
  await expect(readBoundedJson(new Response('{"ok":true}'), 32)).resolves.toEqual({ ok: true })
})
