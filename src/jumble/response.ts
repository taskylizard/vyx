/** Read a fetch response without allowing an unbounded body into memory. */
export async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const limit = Math.max(1, Math.trunc(maxBytes))
  const body = response.body
  if (body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new Error('Response exceeded the safety limit.')
    return bytes
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Response exceeded the safety limit.')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const bytes = await readBoundedBytes(response, maxBytes)
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}
