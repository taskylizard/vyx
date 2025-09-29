import { defineEvent } from '../../src'

export default defineEvent<'ready'>(() => {
  console.log(`Ready! Logged `)
})
