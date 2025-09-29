import { type PrismaClient } from '@packages/database'
import { PersonalityManager } from '@packages/inference-engine'

export class PersonalityEngineModule {
  private personalityManager: PersonalityManager
  private initializationPromise: Promise<void> | null = null

  constructor(prisma: PrismaClient) {
    this.personalityManager = new PersonalityManager(prisma)
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this.initializeAsync()
    return this.initializationPromise
  }

  private async initializeAsync(): Promise<void> {
    // Use setImmediate to make this completely non-blocking
    return new Promise<void>((resolve, reject) => {
      setImmediate(async () => {
        try {
          console.log(
            'Starting personality engine initialization in background...'
          )
          await this.personalityManager.initializePersonalities()
          console.log('Personality engine initialization completed')
          resolve()
        } catch (error) {
          console.error('Personality engine initialization failed:', error)
          reject(error)
        }
      })
    })
  }

  async shutdown(): Promise<void> {
    await this.personalityManager.shutdown()
  }

  getPersonalityManager(): PersonalityManager {
    return this.personalityManager
  }
}
