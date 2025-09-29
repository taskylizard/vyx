import { type PrismaClient } from '@packages/database'
import { MetadataMode, VectorStoreIndex } from 'llamaindex'
import type { OpenAIPromptItem } from '../../'
import { logger } from '../../logger'
import { MemorySystem } from '../memory-system'
import { createPersonalityStorageContext } from '../settings'

export class ContextBuilder {
  private memorySystem: MemorySystem
  private personalityIndexCache: Map<string, VectorStoreIndex> = new Map()
  private logger = logger.withTag('ContextBuilder')

  constructor(private prisma: PrismaClient) {
    this.memorySystem = new MemorySystem(prisma)
  }

  async buildContext(
    personalityName: string,
    userId: string,
    userMessage: string,
    _channelId: string,
    userName: string
  ): Promise<OpenAIPromptItem[]> {
    const context: OpenAIPromptItem[] = []

    this.logger.debug(
      `Building context for personality ${personalityName}, user ${userId}`
    )

    try {
      // First get the personality name from the database
      const p = await this.prisma.personality.findUnique({
        where: { id: personalityName }
      })

      if (!p) {
        this.logger.error(`Personality not found: ${personalityName}`)
        return [{
          role: 'user',
          content: userMessage,
          name: userName
        }]
      }

      this.logger.debug('Retrieving personality data...')
      const personalityData = await this.retrievePersonalityData(
        p.name,
        userMessage
      )

      console.log('\n=== PERSONALITY DATA RETRIEVAL DEBUG ===')
      console.log('Personality Name:', p.name)
      console.log('User Message:', userMessage)
      console.log('Retrieved personality data count:', personalityData.length)
      console.log('Retrieved personality data:', personalityData)
      console.log('=== END PERSONALITY DEBUG ===\n')

      if (personalityData.length > 0) {
        this.logger.debug(
          `Found ${personalityData.length} relevant personality examples`
        )

        // format personality data as realistic conversation examples
        const styleInstructions = personalityData
          .map((data) => {
            // clean up the example and present it naturally
            const cleanExample = data.replace(/^Example \d+: "/, '').replace(
              /"$/,
              ''
            )
            return `"${cleanExample}"`
          })
          .join('\n')

        console.log('\n=== STYLE INSTRUCTIONS DEBUG ===')
        console.log('Style instructions being added:')
        console.log(styleInstructions)
        console.log('=== END STYLE DEBUG ===\n')

        context.push({
          role: 'system',
          content:
            `You should respond in the same style and personality as these examples of your previous messages:\n\n${styleInstructions}\n\nMimic this exact communication style: casual tone, word choice, sentence structure, and personality. Be authentic to this voice.`
        })
      } else {
        console.log('\n=== NO PERSONALITY DATA FOUND ===')
        console.log(
          'No personality examples retrieved for personality:',
          personalityName
        )
        console.log('User message was:', userMessage)
        console.log('=== END NO DATA DEBUG ===\n')
        this.logger.debug('No personality data found')
      }

      // retrieve user memories
      this.logger.debug('Retrieving user memories...')
      const memories = await this.memorySystem.recallUserMemories(
        personalityName,
        userId,
        userMessage,
        3
      )

      if (memories.length > 0) {
        this.logger.debug(`Found ${memories.length} user memories`)
        const memoryContent = memories
          .map(memory => `- ${memory.content}`)
          .join('\n')

        context.push({
          role: 'system',
          content: `Things I remember about this user:\n${memoryContent}`
        })
      } else {
        this.logger.debug('No user memories found')
      }
    } catch (error) {
      this.logger.error('Failed to build full context:', error)
      // return basic context if advanced context building fails
    }

    // add user message LAST so it's the most recent context
    context.push({
      role: 'user',
      content: userMessage,
      name: userName
    })

    this.logger.debug(`Built context with ${context.length} items`)
    return context
  }

  private async retrievePersonalityData(
    personalityName: string,
    query: string
  ): Promise<string[]> {
    try {
      console.log('\n=== VECTOR SEARCH DEBUG ===')
      console.log('Searching for personality:', personalityName)
      console.log('Query:', query)

      let index = this.personalityIndexCache.get(personalityName)
      if (!index) {
        this.logger.debug(
          `Creating vector index for personality ${personalityName}`
        )
        console.log('No cached index found, creating new one...')
        const storageContext = await createPersonalityStorageContext(
          personalityName
        )
        try {
          index = await VectorStoreIndex.init({ storageContext })
          this.personalityIndexCache.set(personalityName, index)
          console.log('Vector index created successfully')
          this.logger.debug(
            `Vector index created and cached for personality ${personalityName}`
          )
        } catch (error) {
          console.log('Failed to create vector index:', error)
          this.logger.debug(
            `No personality data stored yet for personality ${personalityName}`
          )
          return []
        }
      } else {
        console.log('Using cached vector index')
      }

      console.log('Creating retriever with similarityTopK: 5')
      const retriever = index.asRetriever({ similarityTopK: 5 })
      const results = await retriever.retrieve(query)

      console.log('Search results count:', results.length)
      results.forEach((result, i) => {
        console.log(`Result ${i}:`, result.node.getContent(MetadataMode.NONE))
        console.log(`Metadata ${i}:`, result.node.metadata)
        console.log(`Score ${i}:`, result.score)
      })

      const personalityData = results.map(result =>
        result.node.getContent(MetadataMode.NONE)
      ).slice(0, 3)

      console.log('Final personality data array:', personalityData)
      console.log('=== END VECTOR SEARCH DEBUG ===\n')

      this.logger.debug(
        `Retrieved ${personalityData.length} personality data items for query: "${query}"`
      )

      return personalityData
    } catch (error) {
      console.log('Error in retrievePersonalityData:', error)
      this.logger.error('Failed to retrieve personality data:', error)
      return []
    }
  }

  clearCache(): void {
    this.logger.debug('Clearing context builder cache')
    this.personalityIndexCache.clear()
    this.memorySystem.clearCache()
  }
}
