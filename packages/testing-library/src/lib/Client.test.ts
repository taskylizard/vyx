import { beforeAll, expect, test } from 'bun:test'
import {
  type ApplicationCommand,
  ApplicationCommandTypes,
  CommandInteraction,
  type Guild
} from 'oceanic.js'
import { Client } from './Client'
import { type TextChannel } from './structures/TextChannel'

interface TestContext {
  client: Client
  guild: Guild
  channel: TextChannel
  command: ApplicationCommand
}

let context: TestContext

beforeAll(() => {
  const client = new Client()
  const guild = client.__testing__.createGuild()
  const channel = client.getChannel<TextChannel>(guild.id)!
  const command = client.__testing__.registerCommand({
    name: 'command',
    description: 'A test command',
    type: ApplicationCommandTypes.CHAT_INPUT
  })

  context = { client, guild, channel, command }
})

test('connecting', async () => {
  await context.client.__testing__.connect()

  expect(context.client.users.get(context.client.user.id)?.id).toBe(
    context.client.user.id
  )
})

test('command ran', () => {
  context.client.once('interactionCreate', (interaction) => {
    expect(interaction).toBeInstanceOf(CommandInteraction)
    expect((interaction as CommandInteraction).data.name).toBe(
      context.command.name
    )
  })

  context.client.__testing__.callCommand(
    context.channel,
    context.client.user,
    context.command.name
  )
})

test('message sent', () => {
  context.client.once('messageCreate', (msg) => {
    expect(msg.content).toBe('content')
  })

  return context.client.__testing__.sendMessage(context.channel, {
    content: 'content'
  })
})

test('message response', async () => {
  const promise = new Promise<void>((resolve) => {
    context.client.once('messageCreate', (msg) => {
      msg.channel?.createMessage({
        content: 'response'
      })
        .then((response) => {
          expect(response.content).toBe('response')
          expect(response.channel.messages.has(response.id)).toBe(true)
        })
        .catch(() => {
          throw new Error('Failed to create message')
        })
        .finally(() => resolve())
    })
  })

  await context.client.__testing__.sendMessage(context.channel, {
    content: 'initial'
  })

  return await promise
})
