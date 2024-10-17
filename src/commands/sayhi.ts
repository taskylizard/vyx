import { defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'sayhi',
  description: 'Say hi',
  run: 'Hi!'
})
