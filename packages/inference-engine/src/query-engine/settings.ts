import { Gemini, GEMINI_MODEL } from '@llamaindex/google'
import { HuggingFaceEmbedding } from '@llamaindex/huggingface'
import { QdrantVectorStore } from '@llamaindex/qdrant'
import env from '@packages/env'
import { Settings, storageContextFromDefaults } from 'llamaindex'

export function initSettings() {
  Settings.llm = new Gemini({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: GEMINI_MODEL.GEMINI_2_0_FLASH
  })
  Settings.embedModel = new HuggingFaceEmbedding({
    modelType: 'BAAI/bge-small-en-v1.5'
  })
}

export function createQdrantVectorStore(guildId: string): QdrantVectorStore {
  return new QdrantVectorStore({
    url: process.env.NODE_ENV === 'development'
      ? 'http://localhost:6333'
      : 'http://qdrant:6333',
    collectionName: `vyx_guild_${guildId}`,
    embedModel: new HuggingFaceEmbedding({
      modelType: 'BAAI/bge-small-en-v1.5'
    })
  })
}

export async function createStorageContext(guildId: string) {
  const vectorStore = createQdrantVectorStore(guildId)
  return storageContextFromDefaults({ vectorStore })
}
