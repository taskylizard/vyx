import type { Client } from 'oceanic.js'

type TypingClient = {
  rest: {
    channels: Pick<Client['rest']['channels'], 'sendTyping'>
  }
}

export function startJumbleTyping(
  client: TypingClient,
  channelId: string,
  intervalMs = 8_000
): () => void {
  let stopped = false
  let pending = false
  const send = async (): Promise<void> => {
    if (stopped || pending) return
    pending = true
    try {
      await client.rest.channels.sendTyping(channelId)
    } catch {
      stopped = true
      clearInterval(timer)
    } finally {
      pending = false
    }
  }
  const timer = setInterval(() => void send(), Math.max(1, Math.trunc(intervalMs)))
  timer.unref()
  void send()

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
