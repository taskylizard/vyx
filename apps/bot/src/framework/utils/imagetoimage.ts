import { env } from '@packages/env'

/**
 * Send image and prompt to Modal image-to-image endpoint and return the generated image bytes.
 * @param imageBase64 - base64 encoded image data
 * @param prompt - the prompt for image generation
 * @param options - optional parameters (guidance_scale, num_inference_steps, seed)
 * @returns Promise<Buffer> - the generated image bytes
 */
export async function imagetoimage(
  imageBase64: string,
  prompt: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const body = {
    image: imageBase64,
    prompt,
    ...options
  }

  const res = await fetch(
    env.INFERENCE_IMAGE_SERVICE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  )

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Error ${res.status}: ${errorBody}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
