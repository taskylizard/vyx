/** @jsx h */
/** @jsxFrag Fragment */
import {
  Button,
  ComponentMessage,
  Section,
  Separator,
  TextDisplay
} from '@packages/components-jsx'
import { Fragment, h } from '@packages/components-jsx/jsx-runtime'
import {
  generateQueryResponse,
  generateServerSystemPrompt,
  type Props,
  type Role
} from '@packages/inference-engine'
import {
  ButtonStyles,
  ChannelTypes,
  type Message,
  MessageFlags,
  SeparatorSpacingSize
} from 'oceanic.js'
import { Client } from './client'
import { fetchMessageCached, isTextableGuildChannel } from './utils/discord'

const compareMessages = (a: Message, b: Message) => {
  const aId = BigInt(a.id)
  const bId = BigInt(b.id)
  if (aId === bId) return 0
  return aId < bId ? -1 : 1
}

const extractComponentText = (components: Message['components']) => {
  if (!components) return ''

  const collected: string[] = []
  const visit = (items: Message['components']) => {
    if (!items) return
    for (const item of items) {
      if (!item) continue
      if ('content' in item && typeof item.content === 'string') {
        collected.push(item.content)
      }
      if ('components' in item && Array.isArray(item.components)) {
        visit(item.components as Message['components'])
      }
    }
  }

  visit(components)
  return collected.join('\n').trim()
}

const getMessageContent = (message: Message) => {
  const { content, components, embeds } = message
  if (content?.trim()) return content.trim()

  const componentText = extractComponentText(components)
  if (componentText) return componentText

  if (!embeds) return ''
  const embedText = embeds
    .map((embed) =>
      [embed.title, embed.description]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join('\n')
    )
    .filter(Boolean)
    .join('\n')

  return embedText.trim()
}

export async function followReplyChain(
  history: Message[],
  client: Client,
  msg: Message
) {
  while (
    msg.referencedMessage?.id &&
    msg.channel &&
    isTextableGuildChannel(msg.channel)
  ) {
    const repliedMessage = await fetchMessageCached(
      client,
      msg.channel!,
      msg.referencedMessage.id
    ).catch(() => null)
    if (!repliedMessage) break

    const isCurrentBotMessage = repliedMessage.author.id === client.user.id
    if (!repliedMessage.author.bot || isCurrentBotMessage) {
      history.unshift(repliedMessage)
    }

    msg = repliedMessage
  }
}

export async function createMessageHistory(
  client: Client,
  message: Message,
  MAX_MESSAGES = 20, // Maximum number of messages to fetch including replies
  MAX_FETCHES = 10 // Maximum number of messages to fetch excluding replies
): Promise<Message[]> {
  const history: Message[] = []

  await followReplyChain(history, client, message)

  let lastMessageId = message.id
  while (history.length < MAX_FETCHES) {
    const messages = await message.channel?.getMessages({
      before: lastMessageId,
      limit: MAX_FETCHES
    })
    if (!messages || messages.length === 0) break

    for (const msg of messages.values()) {
      lastMessageId = msg.id
      if (history.length >= MAX_MESSAGES) break
      const isCurrentBotMessage = msg.author.id === client.user.id
      if (msg.author.bot && !isCurrentBotMessage) continue

      history.push(msg)

      await followReplyChain(history, client, msg)
    }
  }

  return history
}

export async function handleForumMessage(client: Client, message: Message) {
  if (!message.channel) return

  const question = getMessageContent(message)
  if (!question) return
  if (
    message.channel?.type === ChannelTypes.PUBLIC_THREAD &&
    message.channel.parent?.type === ChannelTypes.GUILD_FORUM &&
    message.author.id !== message.channel.ownerID
  ) {
    return
  }
  if (
    message.channel?.type === ChannelTypes.PUBLIC_THREAD &&
    message.channel.parent?.type === ChannelTypes.GUILD_FORUM
  ) {
    const firstMessage = await message.channel
      .getMessages({ limit: 1 })
      .then((messages) => messages.at(0))
      .catch(() => null)
    if (
      firstMessage?.reactions &&
      firstMessage.reactions.filter((reaction) => reaction.emoji.name === '🛟')
          .length > 0
    ) {
      return
    }
  }

  const reply = await message.channel.createMessage({
    messageReference: message.messageReference,
    components: [<TextDisplay>Searching for an answer...</TextDisplay>],
    allowedMentions: { repliedUser: false },
    flags: MessageFlags.IS_COMPONENTS_V2
  })
  const history = await createMessageHistory(client, message)
  const sortedHistory = [...history].sort(compareMessages)

  // Get guild settings for query engine
  const settings = await client.modules.queryEngine.getSettings(
    message.guildID!
  )

  const systemPrompt = generateServerSystemPrompt(
    settings!.personality,
    settings!.exampleQna,
    settings!.systemPrompt
  )

  if (!settings?.compiled) {
    await reply.edit(
      <ComponentMessage>
        <TextDisplay>
          Query engine not configured. Please run `/query-engine setup` first.
        </TextDisplay>
      </ComponentMessage>
    )
    return
  }

  const props: Props = {
    history: [
      ...sortedHistory.map((msg) => ({
        role: (msg.author.id === client.user.id ? 'assistant' : 'user') as Role,
        content: getMessageContent(msg)
      })),
      {
        role: 'user',
        content: question
      }
    ],
    guild: {
      id: message.guildID!,
      system: systemPrompt
    }
  }

  try {
    const response = await generateQueryResponse(props)

    // Ensure we have a valid string response
    let validResponse = ''
    if (response && typeof response === 'string' && response.trim()) {
      validResponse = response.trim()
    } else {
      await reply.edit(
        <ComponentMessage>
          <TextDisplay>
            Sorry, I couldn't generate a response. Please try again or ask a
            human for help.
          </TextDisplay>
        </ComponentMessage>
      )
      return
    }

    const replyContent = (
      <TextDisplay>{validResponse || 'No response generated'}</TextDisplay>
    )

    const seperator = (
      <Separator spacing={SeparatorSpacingSize.SMALL} divider={true} />
    )

    const ActionSection1 = (
      <Section
        accessory={
          <Button customID='resolved' style={ButtonStyles.SUCCESS}>
            Yes!
          </Button>
        }
      >
        <TextDisplay>**Was this helpful?**</TextDisplay>
      </Section>
    )
    const ActionFooter = (
      <TextDisplay>
        -# You can post another message to continue the conversation!
      </TextDisplay>
    )

    await reply.edit(
      <ComponentMessage>
        {replyContent}
        {seperator}
        {ActionSection1}
        {ActionFooter}
      </ComponentMessage>
    )
  } catch (error) {
    console.error('Error generating query response:', error)
    await reply.edit(
      <ComponentMessage>
        <TextDisplay>
          Sorry, I encountered an error while searching for an answer. Please
          try again later.
        </TextDisplay>
      </ComponentMessage>
    )
  }
}
