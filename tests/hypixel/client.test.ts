import { expect, test } from 'vite-plus/test'
import { HypixelClient, HypixelError } from '../../src/hypixel/client.ts'
import type { HypixelClientOptions } from '../../src/hypixel/client.ts'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function createClient(
  overrides: Partial<HypixelClientOptions> & { respond: (url: URL) => Response }
): { client: HypixelClient; calls: URL[] } {
  const calls: URL[] = []
  const client = new HypixelClient({
    apiKey: 'hypixel-key',
    ...overrides,
    fetchImpl: async (input, init) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
      calls.push(url)
      expect(new Headers(init?.headers).get('API-Key')).toBe('hypixel-key')
      return overrides.respond(url)
    }
  })
  return { client, calls }
}

test('sends the api key and parses player payloads', async () => {
  const { client, calls } = createClient({
    respond: () => jsonResponse({ success: true, player: { displayname: 'tasky' } })
  })

  const player = await client.player('uuid-1')

  expect(player.displayname).toBe('tasky')
  expect(calls).toHaveLength(1)
  expect(calls[0]?.pathname).toBe('/v2/player')
  expect(calls[0]?.searchParams.get('uuid')).toBe('uuid-1')
})

test('reuses the cached raw response within the ttl', async () => {
  let clock = 1_000
  const { client, calls } = createClient({
    now: () => clock,
    respond: () => jsonResponse({ success: true, products: {} })
  })

  await client.bazaar()
  await client.bazaar()
  expect(calls).toHaveLength(1)

  clock += 61_000
  await client.bazaar()
  expect(calls).toHaveLength(2)
})

test('retries after a failed request instead of caching the rejection', async () => {
  let attempts = 0
  const { client } = createClient({
    respond: () => {
      attempts += 1
      return jsonResponse({ success: false, cause: 'boom' }, 500)
    }
  })

  await expect(client.bazaar()).rejects.toThrow(HypixelError)
  await expect(client.bazaar()).rejects.toThrow('Hypixel API returned 500')
  expect(attempts).toBe(2)
})

test('surfaces http error causes with their status', async () => {
  const { client } = createClient({
    respond: () => jsonResponse({ cause: 'Profile not found' }, 404)
  })

  let caught: unknown
  try {
    await client.activeProfile('uuid-1', 'Zucchini')
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(HypixelError)
  expect(caught).toMatchObject({
    message: expect.stringContaining('Profile not found'),
    status: 404
  })
})

test('resolves the configured profile by name from the profiles list', async () => {
  const { client, calls } = createClient({
    respond: () =>
      jsonResponse({
        success: true,
        profiles: [
          { cute_name: 'Strawberry', members: {}, profile_id: 'p-straw', selected: true },
          { cute_name: 'Watermelon', members: {}, profile_id: 'p-melon', selected: false }
        ]
      })
  })

  const profile = await client.activeProfile('uuid-1', 'watermelon')

  expect(profile?.cute_name).toBe('Watermelon')
  expect(calls.map((call) => call.pathname)).toEqual(['/v2/skyblock/profiles'])
})

test('falls back to the selected profile when the named one is missing', async () => {
  const { client } = createClient({
    respond: () =>
      jsonResponse({
        success: true,
        profiles: [
          { cute_name: 'Strawberry', members: {}, profile_id: 'p-other', selected: false },
          { cute_name: 'Raspberry', members: {}, profile_id: 'p-selected', selected: true }
        ]
      })
  })

  const profile = await client.activeProfile('uuid-1', 'Zucchini')

  expect(profile?.cute_name).toBe('Raspberry')
})
