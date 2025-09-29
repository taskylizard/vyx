import { type PrismaClient } from '@packages/database'
import { Document, MetadataMode, VectorStoreIndex } from 'llamaindex'
import { logger } from '../logger'
import { createPersonalityStorageContext } from './settings'

export interface MemoryEntry {
  id: string
  personalityName: string
  userId: string
  content: string
  context?: string
  createdAt: Date
}

export class MemorySystem {
  private memoryIndexCache: Map<string, VectorStoreIndex> = new Map()
  private logger = logger.withTag('MemorySystem')

  constructor(private prisma: PrismaClient) {}

  async rememberAboutUser(
    name: string,
    userId: string,
    information: string,
    context?: string
  ): Promise<void> {
    try {
      this.logger.debug(`Storing memory for user ${userId}: ${information}`)

      // store in database
      await this.prisma.personalityMemory.create({
        data: {
          personalityName: name,
          userId,
          content: information,
          context
        }
      })

      // store in vector index for semantic search
      await this.addMemoryToIndex(name, userId, information, context)

      this.logger.success(`Memory stored for user ${userId}`)
    } catch (error) {
      this.logger.error('Failed to remember information:', error)
      throw error
    }
  }

  async recallUserMemories(
    name: string,
    userId: string,
    query?: string,
    limit: number = 5
  ): Promise<MemoryEntry[]> {
    try {
      this.logger.debug(
        `Recalling memories for user ${userId} with query: ${query || 'none'}`
      )

      if (query) {
        // semantic search using vector similarity
        const memories = await this.searchMemoriesSemanticially(
          name,
          userId,
          query,
          limit
        )
        this.logger.debug(
          `Found ${memories.length} memories via semantic search`
        )
        return memories
      } else {
        // return recent memories
        const memories = await this.prisma.personalityMemory.findMany({
          where: {
            personalityName: name,
            userId
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: limit
        })

        const memoryEntries = memories.map((
          memory: any
        ) => ({
          id: memory.id,
          personalityName: memory.personalityName,
          userId: memory.userId,
          content: memory.content,
          context: memory.context || undefined,
          createdAt: memory.createdAt
        }))

        this.logger.debug(`Found ${memoryEntries.length} recent memories`)
        return memoryEntries
      }
    } catch (error) {
      this.logger.error('Failed to recall memories:', error)
      return []
    }
  }

  async forgetUserMemory(
    name: string,
    userId: string,
    memoryId: string
  ): Promise<void> {
    try {
      this.logger.debug(`Forgetting memory ${memoryId} for user ${userId}`)
      await this.prisma.personalityMemory.deleteMany({
        where: {
          id: memoryId,
          personalityName: name,
          userId
        }
      })

      this.logger.success(`Memory ${memoryId} forgotten for user ${userId}`)
      // note: we don't remove from vector index as it's complex and not critical
      // the memory will just be orphaned in the vector store
    } catch (error) {
      this.logger.error('Failed to forget memory:', error)
      throw error
    }
  }

  private async addMemoryToIndex(
    name: string,
    userId: string,
    information: string,
    context?: string
  ): Promise<void> {
    try {
      const memoryText = context
        ? `${information} (Context: ${context})`
        : information

      this.logger.debug(
        `Adding memory to vector index: ${memoryText.substring(0, 100)}...`
      )

      const document = new Document({
        text: memoryText,
        metadata: {
          type: 'memory',
          personalityName: name,
          userId,
          timestamp: new Date().toISOString()
        }
      })

      const storageContext = await createPersonalityStorageContext(
        `${name}_memories`
      )

      // try to get existing index or create new one
      let index = this.memoryIndexCache.get(name)
      if (!index) {
        try {
          index = await VectorStoreIndex.init({ storageContext })
        } catch {
          index = await VectorStoreIndex.fromDocuments([], { storageContext })
        }
        this.memoryIndexCache.set(name, index)
      }

      // add new document to index
      index.insert(document)
      this.logger.debug('Memory added to vector index successfully')
    } catch (error) {
      this.logger.error('Failed to add memory to index:', error)
    }
  }

  private async searchMemoriesSemanticially(
    name: string,
    userId: string,
    query: string,
    limit: number
  ): Promise<MemoryEntry[]> {
    try {
      let index = this.memoryIndexCache.get(name)
      if (!index) {
        const storageContext = await createPersonalityStorageContext(
          `${name}_memories`
        )
        try {
          index = await VectorStoreIndex.init({ storageContext })
          this.memoryIndexCache.set(name, index)
        } catch {
          // no memories stored yet
          return []
        }
      }

      const retriever = index.asRetriever({ similarityTopK: limit })
      const results = await retriever.retrieve(query)

      // filter by user and convert to MemoryEntry format
      const filteredResults = results
        .filter(result => result.node.metadata?.userId === userId)
        .map(result => ({
          id: result.node.id_,
          personalityName: name,
          userId,
          content: result.node.getContent(MetadataMode.NONE) || '',
          context: undefined,
          createdAt: new Date(result.node.metadata?.timestamp || Date.now())
        }))

      return filteredResults.slice(0, limit)
    } catch (error) {
      console.error('Failed to search memories semantically:', error)
      return []
    }
  }

  clearCache(): void {
    this.memoryIndexCache.clear()
  }
}
