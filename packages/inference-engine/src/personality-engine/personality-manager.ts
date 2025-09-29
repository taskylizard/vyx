import { PersonalityStatus, type PrismaClient } from '@packages/database'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from '../logger'
import { ClientManager } from './client-manager'
import { DataProcessor } from './data-processor'
import { MemorySystem } from './memory-system'

export interface PersonalityConfig {
  name: string
  channels: string[]
  systemPrompt: string
  botToken: string
}

export class PersonalityManager {
  private dataProcessor: DataProcessor
  private clientManager: ClientManager
  private memorySystem: MemorySystem
  private logger = logger.withTag('PersonalityManager')

  constructor(private prisma: PrismaClient) {
    this.dataProcessor = new DataProcessor(prisma)
    this.clientManager = new ClientManager(prisma)
    this.memorySystem = new MemorySystem(prisma)
  }

  async initializePersonalities(): Promise<void> {
    // Use absolute path to project root personalities directory
    const personalitiesPath = '/home/tasky/projects/vyx/personalities'

    this.logger.info('Initializing personalities...')
    try {
      const directories = await readdir(personalitiesPath, {
        withFileTypes: true
      })

      for (const dir of directories) {
        if (dir.isDirectory()) {
          await this.processPersonality(
            dir.name,
            join(personalitiesPath, dir.name)
          )
        }
      }
      this.logger.success(`Initialized ${directories.length} personalities.`)
    } catch (error) {
      this.logger.error('Failed to initialize personalities:', error)
    }
  }

  private async processPersonality(
    name: string,
    personalityPath: string
  ): Promise<void> {
    try {
      // Read config.json
      const configPath = join(personalityPath, 'config.json')
      const configData = await readFile(configPath, 'utf-8')
      const config = JSON.parse(configData) as PersonalityConfig

      // Check if personality exists in database
      let personality = await this.prisma.personality.findUnique({
        where: { name }
      })

      if (!personality) {
        personality = await this.prisma.personality.create({
          data: {
            name,
            status: PersonalityStatus.PROCESSING
          }
        })
        this.logger.info(`Created new personality: ${name}`)
      }

      if (personality.status !== PersonalityStatus.ACTIVE) {
        this.logger.info(`Processing data for personality: ${name}`)
        await this.dataProcessor.processPersonalityData(
          name,
          personalityPath
        )

        // Update status to active
        await this.prisma.personality.update({
          where: { id: personality.id },
          data: { status: PersonalityStatus.ACTIVE }
        })
        this.logger.success(`Personality ${name} marked as active`)
      } else {
        this.logger.info(
          `Personality ${name} already active, skipping data processing`
        )
      }

      // Initialize Discord client
      this.logger.info(`Initializing Discord client for personality: ${name}`)
      await this.clientManager.initializeClient(personality.id, config)
      this.logger.success(`Discord client initialized for personality: ${name}`)
    } catch (error) {
      this.logger.error(`Failed to process personality ${name}:`, error)

      // Update status to inactive on error
      await this.prisma.personality.updateMany({
        where: { name },
        data: { status: PersonalityStatus.INACTIVE }
      })
    }
  }

  async getMemorySystem(): Promise<MemorySystem> {
    return this.memorySystem
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down personality manager...')
    await this.clientManager.shutdown()
  }
}
