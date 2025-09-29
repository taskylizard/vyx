import { HuggingFaceEmbedding } from '@llamaindex/huggingface'
import { QdrantVectorStore } from '@llamaindex/qdrant'
import { storageContextFromDefaults } from 'llamaindex'

export function createPersonalityQdrantVectorStore(
  personalityName: string
): QdrantVectorStore {
  return new QdrantVectorStore({
    url: process.env.NODE_ENV === 'development'
      ? 'http://localhost:6333'
      : 'http://qdrant:6333',
    collectionName: `personality_${personalityName}`,
    embedModel: new HuggingFaceEmbedding({
      modelType: 'BAAI/bge-small-en-v1.5',
      modelOptions: {}
    })
  })
}

export async function createPersonalityStorageContext(personalityName: string) {
  const vectorStore = createPersonalityQdrantVectorStore(personalityName)
  return storageContextFromDefaults({ vectorStore })
}
