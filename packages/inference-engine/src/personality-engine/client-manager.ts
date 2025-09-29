import { type PrismaClient } from '@packages/database'
import { ChannelTypes, Client as OceanicClient, type Message } from 'oceanic.js'
import { generateVelvetText } from '../'
import { logger } from '../logger'
import { MemorySystem } from './memory-system'
import type { PersonalityConfig } from './personality-manager'
import { ContextBuilder } from './tools/context-builder'

interface MessageNode {
  text: string | null
  userId: string | null
  fetchParentFailed: boolean
  parentMsg: Message | null
}

class LRUMessageCache {
  private cache = new Map<string, MessageNode>()
  private maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  get(messageId: string): MessageNode {
    if (this.cache.has(messageId)) {
      // Move to end (most recently used)
      const node = this.cache.get(messageId)!
      this.cache.delete(messageId)
      this.cache.set(messageId, node)
      return node
    }

    // Create new node
    const node: MessageNode = {
      text: null,
      userId: null,
      fetchParentFailed: false,
      parentMsg: null
    }

    this.cache.set(messageId, node)

    // Remove oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstEntry = this.cache.entries().next()
      if (!firstEntry.done) {
        this.cache.delete(firstEntry.value[0])
      }
    }

    return node
  }

  clear(): void {
    this.cache.clear()
  }
}

export class ClientManager {
  private clients: Map<string, OceanicClient> = new Map()
  private memorySystem: MemorySystem
  private contextBuilder: ContextBuilder
  private messageCache = new LRUMessageCache()
  private logger = logger.withTag('ClientManager')

  constructor(private prisma: PrismaClient) {
    this.memorySystem = new MemorySystem(prisma)
    this.contextBuilder = new ContextBuilder(prisma)
  }

  async initializeClient(
    personalityName: string,
    config: PersonalityConfig
  ): Promise<void> {
    try {
      // check if client already exists
      if (this.clients.has(personalityName)) {
        this.logger.warn(
          `Client for personality ${personalityName} already exists`
        )
        return
      }

      const client = new OceanicClient({
        auth: `Bot ${config.botToken}`,
        gateway: {
          intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT']
        }
      })

      // set up message handling
      client.on('messageCreate', (message: Message) => {
        this.handleMessage(personalityName, config, message)
      })

      client.on('ready', () => {
        this.logger.success(`Personality bot ${config.name} is ready`)
      })

      await client.connect()
      this.clients.set(personalityName, client)

      this.logger.success(`Initialized client for personality ${config.name}`)
    } catch (error) {
      this.logger.error(
        `Failed to initialize client for personality ${personalityName}:`,
        error
      )
      throw error
    }
  }

  private async handleMessage(
    personalityName: string,
    config: PersonalityConfig,
    message: Message
  ): Promise<void> {
    try {
      // ignore bot messages
      if (message.author.bot) return

      // only handle messages in guilds and text channels
      if (!message.guildID) return
      if (!message.channel) return
      if (message.channel.type !== ChannelTypes.GUILD_TEXT) return

      // check if message is in allowed channels
      if (!config.channels.includes(message.channelID)) return

      const client = this.clients.get(personalityName)
      if (!client?.user) return

      // determine interaction type (mention vs reply)
      const botMention = `<@${client.user.id}>`
      const botMentionNick = `<@!${client.user.id}>`
      const isBotMentioned = message.content.includes(botMention) ||
        message.content.includes(botMentionNick)
      const isReply = !!message.messageReference

      // check if we should respond
      if (!isBotMentioned && !isReply) return

      // if it's a reply, check if we're replying to the bot
      if (
        isReply && !isBotMentioned && message.messageReference?.messageID &&
        message.channel
      ) {
        try {
          const referencedMessage = await message.channel.getMessage(
            message.messageReference.messageID
          )
          if (referencedMessage?.author.id !== client.user.id) return
        } catch {
          // if we can't fetch the referenced message, skip
          return
        }
      }

      const interactionType = isBotMentioned && !isReply ? 'mention' : 'reply'

      this.logger.info(
        `Processing ${interactionType} from ${message.author.username} in personality ${config.name}`
      )

      // build conversation thread like Python bot
      const conversationMessages = await this.buildConversationThread(
        message,
        client.user.id
      )

      this.logger.debug(
        `Built conversation thread with ${conversationMessages.length} messages`
      )

      // clean the current message content
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '<@BOT>')
        .trim()

      if (!cleanContent || cleanContent === '<@BOT>') return

      // build context with conversation history instead of just the current message
      const context = await this.buildContextFromConversation(
        personalityName,
        message.author.id,
        conversationMessages,
        message.channelID
      )

      // debug log the context being sent to LLM
      this.logger.debug('Context being sent to LLM:')
      this.logger.debug(`System prompt: "${config.systemPrompt}"`)
      this.logger.debug('Context messages:')
      this.logger.debug(context)

      // detailed console logs for debugging personality examples
      console.log('\n=== VELVET TEXT GENERATION DEBUG ===')
      console.log('System Prompt:', config.systemPrompt)
      console.log('\nFull Context Array:')
      context.forEach((item, index) => {
        console.log(
          `${index}: [${item.role}] ${
            item.name ? `(${item.name}) ` : ''
          }${item.content}`
        )
      })
      console.log('\nJSON Context:')
      console.log(JSON.stringify(context, null, 2))
      console.log('=== END DEBUG ===\n')

      // generate response using velvet
      this.logger.debug('Generating AI response...')
      const response = await generateVelvetText(context, config.systemPrompt, {
        userId: message.author.id,
        guildId: message.guildID,
        username: message.author.username,
        guildName: message.guild?.name
      })

      if (response.error || !response.data) {
        this.logger.error('No response data from AI')
        return
      }

      const formattedAnswer = response.data.output
      if (!formattedAnswer) {
        this.logger.warn('No formatted answer received from AI')
        return
      }

      this.logger.debug(
        `AI response: "${formattedAnswer.substring(0, 200)}${
          formattedAnswer.length > 200 ? '...' : ''
        }"`
      )

      // check if AI wants to remember something about the user
      await this.processMemoryActions(
        personalityName,
        message.author.id,
        formattedAnswer
      )

      // send response
      if (message.channel) {
        await message.channel.createMessage({
          content: formattedAnswer,
          messageReference: {
            messageID: message.id,
            failIfNotExists: false
          }
        })
        this.logger.success(`Sent response to ${message.author.username}`)
      }
    } catch (error) {
      this.logger.error(
        `Error handling message for personality ${personalityName}:`,
        error
      )

      // send error message
      try {
        if (message.channel) {
          await message.channel.createMessage({
            content: 'Sorry, I encountered an error processing your message.',
            messageReference: {
              messageID: message.id,
              failIfNotExists: false
            }
          })
        }
      } catch (replyError) {
        this.logger.error('Failed to send error message:', replyError)
      }
    }
  }

  private async buildConversationThread(
    message: Message,
    botUserId: string
  ): Promise<Message[]> {
    const messagesInThread: Message[] = []
    let currentMsg: Message | null = message
    const maxMessages = 500 // similar to Python MAX_MESSAGE_NODES

    while (currentMsg && messagesInThread.length < maxMessages) {
      messagesInThread.push(currentMsg)
      const currentNode = this.messageCache.get(currentMsg.id)

      if (!currentNode.parentMsg && !currentNode.fetchParentFailed) {
        try {
          let parentMsg: Message | null = null

          // check if this is a reply to another message
          if (currentMsg.messageReference?.messageID && currentMsg.channel) {
            try {
              parentMsg = await currentMsg.channel.getMessage(
                currentMsg.messageReference.messageID
              )
            } catch {
              // couldn't fetch referenced message
            }
          } else {
            // check if this is a continuation of a conversation (previous message from same author)
            try {
              if (currentMsg.channel) {
                const result = await currentMsg.channel.getMessages({
                  before: currentMsg.id,
                  limit: 1
                }) as Message[]

                if (result.length > 0) {
                  const prevMessage = result[0] as Message
                  if (prevMessage) {
                    // if previous message is from same author and bot wasn't mentioned,
                    // treat it as continuation of conversation
                    if (
                      prevMessage.author.id === currentMsg.author.id &&
                      !currentMsg.content.includes(`<@${botUserId}>`) &&
                      !currentMsg.content.includes(`<@!${botUserId}>`)
                    ) {
                      parentMsg = prevMessage
                    }
                  }
                }
              }
            } catch {
              // couldn't fetch channel history
            }
          }

          currentNode.parentMsg = parentMsg
        } catch (error) {
          this.logger.debug(
            `Failed to fetch parent for message ${currentMsg.id}: ${error}`
          )
          currentNode.fetchParentFailed = true
        }
      }

      currentMsg = currentNode.parentMsg
    }

    // reverse to get chronological order (oldest first)
    messagesInThread.reverse()
    return messagesInThread
  }

  private async buildContextFromConversation(
    name: string,
    userId: string,
    conversationMessages: Message[],
    channelId: string
  ): Promise<any[]> {
    const context: any[] = []

    // add conversation history
    for (const msg of conversationMessages) {
      const isBot = msg.author.bot
      const cleanContent = msg.content
        .replace(/<@!?\d+>/g, '<@BOT>')
        .trim()

      if (!cleanContent) continue

      // use displayName if available (from guild member), otherwise globalName or username
      const userName = msg.member?.displayName || msg.author.globalName ||
        msg.author.username

      context.push({
        role: isBot ? 'assistant' : 'user',
        content: cleanContent,
        name: isBot ? 'assistant' : userName
      })
    }

    try {
      // add personality data and user memories using existing context builder
      const lastMessage = conversationMessages[conversationMessages.length - 1]
      if (lastMessage) {
        const lastMessageUserName = lastMessage.member?.displayName ||
          lastMessage.author.globalName || lastMessage.author.username

        const personalityContext = await this.contextBuilder.buildContext(
          name,
          userId,
          lastMessage.content,
          channelId,
          lastMessageUserName
        )

        // merge personality context but avoid duplicating the user message
        const systemMessages = personalityContext.filter(item =>
          item.role === 'system'
        )
        context.unshift(...systemMessages)
      }
    } catch (error) {
      this.logger.warn(`Failed to build personality context: ${error}`)
    }

    return context
  }

  private async processMemoryActions(
    personalityName: string,
    userId: string,
    aiResponse: string
  ): Promise<void> {
    // simple pattern matching for memory actions
    // in a more sophisticated implementation, this would use function calling
    const rememberMatch = aiResponse.match(/\[REMEMBER:(.+?)\]/i)
    if (rememberMatch && rememberMatch[1]) {
      const information = rememberMatch[1].trim()
      this.logger.debug(`Remembering about user ${userId}: ${information}`)
      await this.memorySystem.rememberAboutUser(
        personalityName,
        userId,
        information
      )
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down all personality clients...')
    for (const [personalityName, client] of this.clients) {
      try {
        client.disconnect()
        this.logger.success(
          `Disconnected client for personality ${personalityName}`
        )
      } catch (error) {
        this.logger.error(
          `Failed to disconnect client for personality ${personalityName}:`,
          error
        )
      }
    }
    this.clients.clear()
  }

  getClient(personalityName: string): OceanicClient | undefined {
    return this.clients.get(personalityName)
  }
}
