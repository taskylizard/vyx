import { defineEvent } from '../../src'

export default defineEvent<'messageCreate'>((message) => {
  console.log(`Message received: ${message.content}`)
})
