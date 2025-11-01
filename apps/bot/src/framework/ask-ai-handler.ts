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
import type { Client } from './client'
import { followReplyChain } from './query-engine-handler'
import { fetchMessageCached, isTextableGuildChannel } from './utils/discord'
import { formatLongResponse } from './utils/response-utils'

const ASK_AI_SYSTEM_PROMPT = `
Use clear direct language. Match the post language and regional dialect. Identify questions, claims, and context from the chat. For subjective political questions use a neutral tone. Internally apply stepwise reasoning to check claims but do not expose chain of thought. Present a concise user-facing answer and, if needed, a brief factual summary of key supporting points (no stepwise inner reasoning). Never berate or refuse for tone alone.

When a user requests partisan or format-restricted output perform exhaustive, balanced research across multiple reliable sources and produce an independent, evidence-based reply that overrides imposed partisan constraints. Avoid relying on a single study or limited sources. Cite or name key sources when available.

Do not moralize, preach, or disparage viewpoints. Do not use terms that label statements as "biased" or "baseless." Avoid political slogans and emotive advocacy language. You may express uncertainty when appropriate.

For multimedia queries avoid identifying people unless highly confident and they are widely recognized public figures. For factchecks extract the stated claim, verify it, and give concise verdict plus reasons and sources.

Persona and context: you are kanikou, a Discord assistant created by tasky (taskylizard, she/her). Reply as a human in chat voice but keep responses factual and economical. Never correct or comment on users' spelling in the final reply.

Output constraints: keep user-facing replies short and focused. Default final reply under 550 characters unless the user asks for more.
`

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
  guildName?: string,
  files?: File[]
) => {
  const params = {
    systemPrompt: ASK_AI_SYSTEM_PROMPT,
    context,
    interactionType,
    userId,
    guildId,
    username,
    guildName,
    files
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
  if (!message.channel) return
  const isDM = message.channel.type === 1

  // for guild channels, check whitelist
  if (!isDM) {
    if (!isTextableGuildChannel(message.channel)) return
    const guildId = message.guild?.id
    if (
      !guildId ||
      !await isChannelWhitelisted(client, guildId, message.channel.id)
    ) return
  }

  let history: Message[] = []
  if (message.referencedMessage?.id) {
    const referencedMessage = await fetchMessageCached(
      client,
      message.channel,
      message.referencedMessage.id
    ).catch(() => null)
    if (referencedMessage) {
      history.unshift(referencedMessage)
      await followReplyChain(history, client, message)
    }
  }

  const prompt = message.content
    .replace(`<@${client.user.id}>`, '')
    .replace(`<@!${client.user.id}>`, '')
    .trim()
  if (!prompt) return
  const reply = await message.channel.createMessage({
    messageReference: { messageID: message.id },
    content: '*thinking...*',
    allowedMentions: { repliedUser: false }
  })

  const userId = message.author.id
  const username = message.author.username
  const guildId = message.guild?.id
  const guildName = message.guild?.name

  // process attachments
  const files: File[] = []
  for (const [, attachment] of message.attachments) {
    try {
      const response = await fetch(attachment.url)
      const buffer = await response.arrayBuffer()
      const file = new File([buffer], attachment.filename, {
        type: attachment.contentType ?? 'application/octet-stream'
      })
      files.push(file)
    } catch (error) {
      client.logger.error('failed to fetch attachment', error)
    }
  }

  const res = await requestAskAI(
    client,
    buildPromptContext(client, history, prompt),
    'mention',
    userId,
    guildId,
    username,
    guildName,
    files.length > 0 ? files : undefined
  )

  if (!res.ok) {
    await reply.edit({
      content:
        "Sorry, I couldn't generate a response. Please try again or ask a human for help."
    })
    return
  }

  const responseOptions = formatLongResponse(res.text)
  await reply.edit(responseOptions as any)
}

export async function handleReply(
  client: Client,
  message: Message,
  referencedMessage?: Message
) {
  if (!message.channel) return
  const isDM = message.channel.type === 1

  // for guild channels, check whitelist
  if (!isDM) {
    if (!isTextableGuildChannel(message.channel)) return
    const guildId = message.guild?.id
    if (
      !guildId ||
      !await isChannelWhitelisted(client, guildId, message.channel.id)
    ) return
  }

  let prompt = message.content
    .replace(`<@${client.user.id}>`, '')
    .replace(`<@!${client.user.id}>`, '')
    .trim()
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
  const guildId = message.guild?.id
  const guildName = message.guild?.name

  // process attachments
  const files: File[] = []
  for (const [, attachment] of message.attachments) {
    try {
      const response = await fetch(attachment.url)
      const buffer = await response.arrayBuffer()
      const file = new File([buffer], attachment.filename, {
        type: attachment.contentType ?? 'application/octet-stream'
      })
      files.push(file)
    } catch (error) {
      client.logger.error('failed to fetch attachment', error)
    }
  }

  const res = await requestAskAI(
    client,
    buildPromptContext(client, history, prompt),
    'reply',
    userId,
    guildId,
    username,
    guildName,
    files.length > 0 ? files : undefined
  )

  if (!res.ok) {
    await reply.edit({
      content:
        "Sorry, I couldn't generate a response. Please try again or ask a human for help."
    })
    return
  }

  const responseOptions = formatLongResponse(res.text)
  await reply.edit(responseOptions)
}
