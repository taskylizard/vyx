This is a testing library for oceanic.js to assist in testing expected interactions with the Discord API for things such as Discord bots or Discord bot frameworks.

## Example Test

```ts
import protoTest, { type TestFn } from 'ava'
import { type TextChannel } from 'oceanic.js'
import { match, spy } from 'sinon'
import { Client } from 'testing-library'

interface Context {
  client: Client
  channel: TextChannel
}

const test = protoTest as TestFn<Context>

test.before((t) => {
  t.context.client = new Client()
  t.context.channel = t.context.client.__testing__.createChannel()
})

test('ping command', async (t) => {
  const spy = spy(t.context.channel, 'createMessage')

  // register your ping command here
  // ...

  await t.context.client.__testing__.sendMessage({
    content: '!ping'
  })

  spy.calledWith(match({ content: 'Pong!' }))
})
```
