import { EmbeddingModel, FlagEmbedding } from 'fastembed'
import { BaseEmbedding } from 'llamaindex'

export type FastEmbedEmbeddingParams = {
  model?: Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>
}

export class FastEmbedEmbedding extends BaseEmbedding {
  model: Exclude<EmbeddingModel, EmbeddingModel.CUSTOM> =
    EmbeddingModel.BGESmallENV15
  private embeddingModel: FlagEmbedding | null = null

  constructor(params: FastEmbedEmbeddingParams = {}) {
    super()
    if (params.model) {
      this.model = params.model
    }
  }

  async getEmbeddingModel() {
    if (!this.embeddingModel) {
      this.embeddingModel = await FlagEmbedding.init({
        model: this.model
      })
    }
    return this.embeddingModel
  }

  override async getTextEmbedding(text: string): Promise<number[]> {
    const embeddingModel = await this.getEmbeddingModel()
    const embeddings = embeddingModel.embed([text], 1)

    for await (const batch of embeddings) {
      const embedding = batch[0]
      if (!embedding) {
        throw new Error('Failed to generate embedding')
      }
      return embedding
    }

    throw new Error('Failed to generate embedding')
  }
}
