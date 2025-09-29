import {
  type ChatMessage,
  ContextChatEngine,
  Document,
  VectorStoreIndex
} from 'llamaindex'
import { createStorageContext, initSettings } from './settings'

// Initialize settings on module load
initSettings()

export type Role = 'assistant' | 'user'

export type Guild = {
  id: string
  system: string
}

export type Props = {
  history: { role: Role; content: string }[]
  guild: Guild
  documents?: Document[]
}

let chatEngineCache: { [guildId: string]: ContextChatEngine } = {}

async function getChatEngine(
  guildId: string,
  systemPrompt: string,
  documents?: Document[]
): Promise<ContextChatEngine> {
  const cacheKey = guildId

  if (!chatEngineCache[cacheKey] || documents) {
    const storageContext = await createStorageContext(guildId)

    let index: VectorStoreIndex
    if (documents && documents.length > 0) {
      // Create new index from documents
      index = await VectorStoreIndex.fromDocuments(documents, {
        storageContext
      })
    } else {
      // Try to load existing index or create empty one
      try {
        index = await VectorStoreIndex.init({ storageContext })
      } catch {
        // If no existing index, create with empty documents
        index = await VectorStoreIndex.fromDocuments([], { storageContext })
      }
    }

    const retriever = index.asRetriever({
      similarityTopK: 10
    })

    chatEngineCache[cacheKey] = new ContextChatEngine({
      retriever,
      systemPrompt: systemPrompt ||
        'You are a helpful assistant that can answer questions based on the provided documentation. Always search the knowledge base before responding.'
    })
  }

  return chatEngineCache[cacheKey]
}

export const generateQueryResponse = async ({
  history,
  guild,
  documents
}: Props): Promise<string> => {
  const chatEngine = await getChatEngine(guild.id, guild.system, documents)

  // Convert history to ChatMessage format
  const chatHistory: ChatMessage[] = history.map((msg) => ({
    role: msg.role,
    content: msg.content
  }))

  // Get the last user message
  const lastUserMessage = history.filter(msg => msg.role === 'user').pop()
  if (!lastUserMessage) {
    throw new Error('No user message found in history')
  }

  // Chat with context
  const response = await chatEngine.chat({
    message: lastUserMessage.content,
    chatHistory
  })

  return response.message.content.toString()
}

export const clearChatEngineCache = (guildId?: string) => {
  if (guildId) {
    // Clear all cache entries for this guild
    Object.keys(chatEngineCache).forEach(key => {
      if (key === guildId) {
        delete chatEngineCache[key]
      }
    })
  } else {
    chatEngineCache = {}
  }
}
