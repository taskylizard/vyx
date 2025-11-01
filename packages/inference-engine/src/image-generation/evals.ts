import { generateImage } from '.'

console.log(
  await generateImage({
    prompt: 'A serene mountain landscape at sunset with vibrant colors',
    model: 'dream',
    app: 'kanikou'
  })
)