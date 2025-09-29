import { type PrismaClient } from '@packages/database'
import { MemorySystem } from '../memory-system'

export interface MemoryTools {
  rememberAboutUser(
    userId: string,
    information: string,
    context?: string
  ): Promise<void>
  recallUserMemories(userId: string, query?: string): Promise<string[]>
  forgetUserMemory(userId: string, memoryId: string): Promise<void>
}

export class MemoryToolsImpl implements MemoryTools {
  private memorySystem: MemorySystem

  constructor(
    private prisma: PrismaClient,
    private personalityName: string
  ) {
    this.memorySystem = new MemorySystem(prisma)
  }

  async rememberAboutUser(
    userId: string,
    information: string,
    context?: string
  ): Promise<void> {
    await this.memorySystem.rememberAboutUser(
      this.personalityName,
      userId,
      information,
      context
    )
  }

  async recallUserMemories(userId: string, query?: string): Promise<string[]> {
    const memories = await this.memorySystem.recallUserMemories(
      this.personalityName,
      userId,
      query
    )
    return memories.map(memory => memory.content)
  }

  async forgetUserMemory(userId: string, memoryId: string): Promise<void> {
    await this.memorySystem.forgetUserMemory(
      this.personalityName,
      userId,
      memoryId
    )
  }
}
