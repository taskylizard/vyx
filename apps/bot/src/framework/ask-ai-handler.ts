import { prisma } from '@packages/database'
import {
  formatAskAIAnswer,
  formatAskAIPrompt,
  generateAskAIResponse
} from '@packages/inference-engine'
import type {
  AskAIInteractionType,
  AskAIResponse,
  OpenAIPromptItem
} from '@packages/inference-engine'
import type { Message } from 'oceanic.js'
import type { EmbedOptions } from 'oceanic.js'
import type { Client } from './client'
import { followReplyChain } from './query-engine-handler'
import { isTextableGuildChannel } from './utils/discord'

const ASK_AI_SYSTEM_PROMPT =
  'Your name is kanikou and you have been asked a question within a Discord server. With this context in mind, answer the question as if you were a human. Answer using the language the prompt was written in. Do not show your own character, just reply to the prompt. Users may also be asking you a general question unrelated to the chat, in that case you may ignore the context provided. However, whenever possible take the chat context into consideration. Users may also ask questions such as "factcheck" and "is this true" and if that hapens, it is most likely that you have been tasked to evaluate a stetement made by a user in the chat. Find the statement, and see if it is true or not, giving reasons why.'

export async function isChannelWhitelisted(
  client: Client,
  guildId: string,
  channelId: string
): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { guildId: BigInt(guildId) }
  })
  return config?.aiWhitelistedChannels?.includes(BigInt(channelId)) ?? false
}

export const buildPromptContext = (
  client: Client,
  history: Message[],
  prompt: string
): OpenAIPromptItem[] => {
  const mappedHistory = history.map((historyMessage): OpenAIPromptItem => ({
    role: historyMessage.author.id === client.user.id ? 'assistant' : 'user',
    content: historyMessage.content,
    name: historyMessage.author.globalName ?? historyMessage.author.username
  }))

  const promptEntry: OpenAIPromptItem = {
    role: 'user',
    content: prompt
  }

  return [...mappedHistory, promptEntry]
}

export const requestAskAI = async (
  client: Client,
  context: OpenAIPromptItem[],
  interactionType: AskAIInteractionType,
  userId?: string,
  guildId?: string,
  username?: string,
  guildName?: string
) => {
  const params = {
    systemPrompt: ASK_AI_SYSTEM_PROMPT,
    context,
    interactionType,
    userId,
    guildId,
    username,
    guildName
  }
  const formattedPrompt = formatAskAIPrompt(params)

  try {
    const { data, error } = await generateAskAIResponse({
      ...params,
      formattedPrompt
    })

    if (error || !data) {
      if (error) client.logger.error('ask-ai engine error', error)
      return { ok: false as const }
    }

    const text = formatAskAIAnswer(data as AskAIResponse)
    return {
      ok: true as const,
      text: text && text.length > 0 ? text : 'No output'
    }
  } catch (error) {
    client.logger.error('ask-ai engine request failed', error)
    return { ok: false as const }
  }
}

export async function handleMention(client: Client, message: Message) {
  if (!message.channel || !isTextableGuildChannel(message.channel)) return
  const guildId = message.guild?.id
  if (
    !guildId || !await isChannelWhitelisted(client, guildId, message.channel.id)
  ) return
  const prompt = message.content.replace(`<@${client.user.id}>`, '').trim()
  if (!prompt) return
  const reply = await message.channel.createMessage({
    messageReference: { messageID: message.id },
    content: '*thinking...*',
    allowedMentions: { repliedUser: false }
  })

  const userId = message.author.id
  const username = message.author.username
  const guildName = message.guild?.name

  const res = await requestAskAI(
    client,
    buildPromptContext(client, [], prompt),
    'mention',
    userId,
    guildId,
    username,
    guildName
  )

  if (!res.ok) {
    await reply.edit({
      content:
        "Sorry, I couldn't generate a response. Please try again or ask a human for help."
    })
    return
  }

  const responseText = res.text
  const textLength = responseText.length
  let editOptions: any = {}

  if (textLength <= 2000) {
    editOptions.content = responseText
  } else if (textLength < 4096) {
    editOptions.embeds = [{ description: responseText }]
  } else {
    editOptions.content = responseText.slice(0, 2000)
    editOptions.files = [
      new File([Buffer.from(responseText, 'utf-8')], 'response.md')
    ]
  }

  await reply.edit(editOptions)
}

export async function handleReply(
  client: Client,
  message: Message,
  referencedMessage?: Message
) {
  if (!message.channel || !isTextableGuildChannel(message.channel)) return
  const guildId = message.guild?.id
  if (
    !guildId || !await isChannelWhitelisted(client, guildId, message.channel.id)
  ) return
  let prompt = message.content.replace(`<@${client.user.id}>`, '').trim()
  // If no prompt after removing mention, use the whole message content
  if (!prompt) {
    prompt = message.content.trim()
    if (!prompt) return
  }
  const reply = await message.channel.createMessage({
    messageReference: { messageID: message.id },
    content: '*thinking...*',
    allowedMentions: { repliedUser: false }
  })
  let history: Message[] = []
  if (referencedMessage) {
    history.unshift(referencedMessage)
  }
  await followReplyChain(history, client, message)

  const userId = message.author.id
  const username = message.author.username
  const guildName = message.guild?.name

  const res = await requestAskAI(
    client,
    buildPromptContext(client, history, prompt),
    'reply',
    userId,
    guildId,
    username,
    guildName
  )

  if (!res.ok) {
    await reply.edit({
      content:
        "Sorry, I couldn't generate a response. Please try again or ask a human for help."
    })
    return
  }

  const responseText = res.text
  const textLength = responseText.length
  let editOptions: any = {}

  if (textLength <= 2000) {
    editOptions.content = responseText
  } else if (textLength < 4096) {
    editOptions.embeds = [{ description: responseText }]
  } else {
    editOptions.content = responseText.slice(0, 2000)
    editOptions.files = [
      new File([Buffer.from(responseText, 'utf-8')], 'response.md')
    ]
  }

  await reply.edit(editOptions)
}
