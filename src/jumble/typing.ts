import type { SendTypingClient } from '../discord/client-types.ts'
import { safeSendTyping } from '../discord/safe-actions.ts'

export function startJumbleTyping(
  client: SendTypingClient,
  channelId: string,
  intervalMs = 8_000
): () => void {
  let stopped = false
  let pending = false
  const send = async (): Promise<void> => {
    if (stopped || pending) return
    pending = true
    try {
      await safeSendTyping(client, channelId)
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
