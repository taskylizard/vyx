import env from '@packages/env'
import type { AnyTextableGuildChannel } from 'oceanic.js'

export async function smugshroom(_input: ReducedMessage[]) {
  let input = null
  if (typeof input !== 'string') {
    input = _input.map((e) => textifyMessageForTaskModels(e)).join('\n')
  }
  const res = await fetch(env.SMUGSHROOM_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text: input })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error ${res.status}: ${body}`)
  }

  const summary = await res.text()
  return summary
}

// a simplified object with fields we most likely need.
// fields should be self-explanatory.
export interface ReducedMessage {
  id: string
  authorNames: [string] | [string, string] // always at least one, the username
  authorId: string
  authorMention: string
  content: string
  attachments: string[]
  time: Date
  replyId?: string
}

// given a text-based channel, grab at most, the `max` amount of messages starting from now.
// in the future, this may need to change to make sure we get a specific amount of messages,
// after disregarding any bot messages.
export async function getMessages(
  channel: AnyTextableGuildChannel,
  max: number
) {
  const messageCollection = await channel.getMessages({ limit: max })
  if (messageCollection.length < 2) {
    return undefined
  }
  const messages: ReducedMessage[] = messageCollection
    .filter(({ author }) => !author.bot)
    .map((msg): ReducedMessage => {
      return {
        id: msg.id,
        authorMention: msg.author.toString(),
        authorId: msg.author.id,
        authorNames: [msg.author.username],
        attachments: msg.attachments
          .filter(
            ({ contentType }) =>
              contentType !== undefined && contentType.length > 0
          )
          .map((attachment) => attachment.contentType!),
        content: msg.content,
        time: new Date(msg.createdAt),
        replyId: msg.referencedMessage?.id
      }
    })

  const { guild } = channel
  for (const message of messages) {
    const member = guild.members.get(message.authorId)
    if (member && member.nick) {
      message.authorNames.push(member.nick)
    }
  }

  messages.sort((a, b) => a.time.getTime() - b.time.getTime())

  return messages
}

// creates a single string, formatted with multiple annotations that can be fed
// into a LLM model (e.g. GPT-3.5/-4, Amazon Titan).
// format:
//   [m#<message id>] u#{<username>/<nickname if applicable>} <at-mention>: <extra context> <message content>
export function textifyMessageForGPTModels(message: ReducedMessage) {
  const { authorNames, authorMention, content, attachments, replyId, id } =
    message
  const author = `{${authorNames.join('}/{')}}`
  const attachmentText = attachments.length > 0
    ? `[attachments: ${attachments.join(', ')}] `
    : ''
  const replyText = replyId ? `[reply to message ${replyId}] ` : ''

  return `[m#${id}] u#{${author}} ${authorMention}: ${replyText}${attachmentText}${content}`
}

// creates a single string, with significantly less annotations (textbook-style)
// to be fed into a model that is fine-tuned for this task (e.g. bart-finetuned from Hugging Face).
// because of the nature of these narrow models, we will have to forgo some
// information, such as replies and attachments.
// format:
//   <username>[/<nickname if applicable>] <at-mention>: <message content>
export function textifyMessageForTaskModels(message: ReducedMessage) {
  const { authorNames, content, authorMention } = message
  return `${authorNames.join('/')} ${authorMention}: ${content}`
}
