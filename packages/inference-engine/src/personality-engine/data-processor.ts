import { type PrismaClient } from '@packages/database'
import { Document, VectorStoreIndex } from 'llamaindex'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPersonalityStorageContext } from './settings'

export interface PersonalityDataMessage {
  ID: number
  Timestamp: string
  Contents: string
  Attachments: string
  AuthorID?: string
  AuthorName?: string
}

export class DataProcessor {
  private readonly BATCH_SIZE = 500

  constructor(private prisma: PrismaClient) {}

  async processPersonalityData(
    personalityName: string,
    personalityPath: string
  ): Promise<void> {
    try {
      const files = await readdir(personalityPath)

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'config.json') {
          const filePath = join(personalityPath, file)
          await this.processDataFile(personalityName, filePath)
        }
      }
    } catch (error) {
      console.error(
        `Failed to process data for personality ${personalityName}:`,
        error
      )
      throw error
    }
  }

  private async processDataFile(
    personalityName: string,
    filePath: string
  ): Promise<void> {
    try {
      const fileContent = await readFile(filePath, 'utf-8')
      const data = JSON.parse(fileContent) as PersonalityDataMessage[]

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`Skipping empty or invalid file: ${filePath}`)
        return
      }

      console.log(`Processing ${data.length} messages from ${filePath}`)

      const storageContext = await createPersonalityStorageContext(
        personalityName
      )
      let totalProcessed = 0

      for (let i = 0; i < data.length; i += this.BATCH_SIZE) {
        const batch = data.slice(i, i + this.BATCH_SIZE)
        const documents: Document[] = []

        for (const message of batch) {
          if (!message.Contents || message.Contents.trim().length === 0) {
            continue
          }

          const cleanContent = this.cleanMessageContent(message.Contents)

          if (cleanContent.length > 10) {
            // store message content with metadata for better style learning
            const messageText = `${cleanContent}`

            documents.push(
              new Document({
                text: messageText,
                metadata: {
                  messageId: message.ID.toString(),
                  timestamp: message.Timestamp,
                  originalContent: message.Contents,
                  authorId: message.AuthorID || 'unknown',
                  authorName: message.AuthorName || 'unknown'
                }
              })
            )
          }
        }

        if (documents.length > 0) {
          await VectorStoreIndex.fromDocuments(documents, { storageContext })
          totalProcessed += documents.length
          console.log(
            `Processed batch: ${totalProcessed}/${data.length} documents`
          )
        }
      }

      console.log(
        `Completed processing ${totalProcessed} documents from ${filePath}`
      )
    } catch (error) {
      console.error(`Failed to process file ${filePath}:`, error)
    }
  }

  private cleanMessageContent(content: string): string {
    return content
      // remove user mentions
      .replace(/<@!?\d+>/g, '@user')
      // remove channel mentions
      .replace(/<#\d+>/g, '#channel')
      // remove role mentions
      .replace(/<@&\d+>/g, '@role')
      // remove custom emojis
      .replace(/<a?:\w+:\d+>/g, ':emoji:')
      // remove URLs (keep the text readable)
      .replace(/https?:\/\/[^\s]+/g, '[link]')
      // clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }
}
