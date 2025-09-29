import type { Prisma, PrismaClient } from '@packages/database'
import {
  clearQdrantCollection,
  compileToDocuments,
  storeDocumentsInIndex
} from '@packages/inference-engine'

type SettingsUpsertData =
  & Prisma.QueryEngineSettingsCreateInput
  & Prisma.QueryEngineSettingsUpdateInput

export class QueryEngineModule {
  constructor(private prisma: PrismaClient) {}

  async addData(guildId: string, owner: string, repo: string, path?: string) {
    try {
      const data = await this.prisma.queryEngineData.create({
        data: {
          guildId: BigInt(guildId),
          owner,
          repo,
          path: path || null
        }
      })
      return data
    } catch (_error) {
      // If duplicate, just return existing
      const existing = await this.prisma.queryEngineData.findFirst({
        where: {
          guildId: BigInt(guildId),
          owner,
          repo,
          path: path || null
        }
      })
      return existing
    }
  }

  async removeData(
    guildId: string,
    owner: string,
    repo: string,
    path?: string
  ) {
    const deleted = await this.prisma.queryEngineData.deleteMany({
      where: {
        guildId: BigInt(guildId),
        owner,
        repo,
        path: path || null
      }
    })
    return deleted
  }

  async listData(guildId: string) {
    const data = await this.prisma.queryEngineData.findMany({
      where: { guildId: BigInt(guildId) }
    })
    return data
  }

  async compileData(guildId: string) {
    try {
      const data = await this.listData(guildId)
      const repos = data.map((d: any) => ({
        owner: d.owner,
        repo: d.repo,
        path: d.path || undefined
      }))

      const documents = await compileToDocuments(repos)

      // Store documents in Qdrant using proper LlamaIndexTS approach
      await storeDocumentsInIndex(guildId, documents)

      // Update settings to mark compilation complete
      await this.updateSettings(guildId, {
        compiled: true
      })

      console.log(
        `Successfully compiled and stored ${documents.length} documents for guild ${guildId}`
      )
      return repos.length
    } catch (error: any) {
      console.error('Failed to compile data:', error)
      throw error
    }
  }

  async clearData(guildId: string) {
    const result = await this.prisma.queryEngineData.deleteMany({
      where: { guildId: BigInt(guildId) }
    })

    // Clear Qdrant collection as well
    try {
      await clearQdrantCollection(guildId)
      console.log(`Cleared Qdrant collection for guild ${guildId}`)
    } catch (error) {
      console.warn(
        `Failed to clear Qdrant collection for guild ${guildId}:`,
        error
      )
    }

    // Clear compilation flag
    await this.updateSettings(guildId, {
      compiled: false
    })

    return result.count
  }

  async getSettings(guildId: string) {
    try {
      const settings = await this.prisma.queryEngineSettings.findUnique({
        where: { guildId: BigInt(guildId) }
      })
      return settings
    } catch (error: any) {
      console.warn('Failed to get settings from database:', error.message)
      return null
    }
  }

  async updateSettings(
    guildId: string,
    data: Omit<SettingsUpsertData, 'guildId'>
  ) {
    const updateData: SettingsUpsertData = {
      guildId: BigInt(guildId)
    }

    if (data.personality !== undefined) {
      updateData.personality = data.personality
    }

    if (data.exampleQna !== undefined) updateData.exampleQna = data.exampleQna
    if (data.systemPrompt !== undefined) {
      updateData.systemPrompt = data.systemPrompt
    }

    if (data.compiled !== undefined) {
      updateData.compiled = data.compiled
    }

    if (data.forumChannelId !== undefined && data.forumChannelId !== null) {
      updateData.forumChannelId = BigInt(data.forumChannelId)
    }

    const settings = await this.prisma.queryEngineSettings.upsert({
      where: { guildId: BigInt(guildId) },
      create: updateData,
      update: {
        ...updateData,
        updatedAt: new Date()
      }
    })
    return settings
  }

  async getForumChannelId(guildId: string): Promise<string | null> {
    const settings = await this.getSettings(guildId)
    return settings?.forumChannelId ? settings.forumChannelId.toString() : null
  }

  async isSetupComplete(
    guildId: string
  ): Promise<{ isComplete: boolean; missingFields: string[] }> {
    const settings = await this.getSettings(guildId)
    const data = await this.listData(guildId)

    const missingFields: string[] = []

    if (!settings?.forumChannelId) {
      missingFields.push('forum channel')
    }

    // Check if there's any data source
    if (data.length === 0) {
      missingFields.push('data sources')
    }

    // Check if data has been compiled
    if (!settings?.compiled) {
      missingFields.push('compiled data')
    }

    return {
      isComplete: missingFields.length === 0,
      missingFields
    }
  }

  public getSetupInstructions() {
    return `**Query Engine Setup Required**

To use the query engine, please complete these steps:

1. **Add data sources**
   \`/query-engine add owner:microsoft repo:vscode\`

2. **Set AI personality**
   \`/query-engine settings personality value:"You are a helpful VS Code assistant."\`

3. **Compile knowledge base**
   \`/query-engine compile\`

4. **Optional: Set forum channel**
   \`/query-engine settings forum-channel channel:#support\`

-# Run \`/query-engine setup\` to check your progress.`
  }
}
