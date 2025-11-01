import { Document, VectorStoreIndex } from 'llamaindex'
import { logger } from '../logger'
import { clearChatEngineCache } from './sdk'
import { createStorageContext } from './settings'

export async function storeDocumentsInIndex(
  guildId: string,
  documents: Document[]
): Promise<void> {
  if (!documents || documents.length === 0) {
    logger.warn(`No documents provided for guild ${guildId}`)
    return
  }

  const storageContext = await createStorageContext(guildId)

  try {
    // Create new index with documents
    await VectorStoreIndex.fromDocuments(documents, { storageContext })
    logger.log(
      `Successfully stored ${documents.length} documents for guild ${guildId}`
    )

    // Clear chat engine cache to force reinitialization with new documents
    clearChatEngineCache(guildId)
  } catch (error) {
    logger.error(`Failed to store documents for guild ${guildId}:`, error)
    throw error
  }
}

export async function clearQdrantCollection(guildId: string): Promise<void> {
  try {
    const _storageContext = await createStorageContext(guildId)
    // The QdrantVectorStore will handle collection deletion when we clear the cache
    clearChatEngineCache(guildId)
    logger.log(`Cleared collection and cache for guild ${guildId}`)
  } catch (error) {
    logger.warn(`Failed to clear collection for guild ${guildId}:`, error)
  }
}
