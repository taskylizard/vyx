#!/usr/bin/env bun

import { prisma } from '@packages/database'
import { logger } from '../logger.js'
import { compileToDocuments, storeDocumentsInIndex } from './index.js'

const GUILD_ID = '1143159917876871178'
const FORUM_CHANNEL_ID = '1414905077986230272'
const SYSTEM_PROMPT =
  'You are a helpful anime and manga assistant. Use the provided knowledge base to answer questions about anime streaming apps, websites, software, and related topics. Be specific and provide relevant recommendations based on the documentation.'

async function seed() {
  logger.log('Starting wotaku query engine seed...')

  try {
    // 1. Add wotaku repository data source
    logger.log('Adding wotaku repository data source...')

    await prisma.queryEngineData.upsert({
      where: {
        guildId_owner_repo_path: {
          guildId: BigInt(GUILD_ID),
          owner: 'wotakumoe',
          repo: 'wotaku',
          path: 'docs'
        }
      },
      create: {
        guildId: BigInt(GUILD_ID),
        owner: 'wotakumoe',
        repo: 'wotaku',
        path: 'docs'
      },
      update: {
        addedAt: new Date()
      }
    })

    // 2. Configure query engine settings
    logger.log('Configuring query engine settings...')

    await prisma.queryEngineSettings.upsert({
      where: { guildId: BigInt(GUILD_ID) },
      create: {
        guildId: BigInt(GUILD_ID),
        personality:
          'You are a knowledgeable wotaku (otaku) community assistant specialized in anime and manga resources.',
        systemPrompt: SYSTEM_PROMPT,
        forumChannelId: BigInt(FORUM_CHANNEL_ID),
        compiled: false
      },
      update: {
        personality:
          'You are a knowledgeable wotaku (otaku) community assistant specialized in anime and manga resources.',
        systemPrompt: SYSTEM_PROMPT,
        forumChannelId: BigInt(FORUM_CHANNEL_ID),
        updatedAt: new Date()
      }
    })

    // 3. Compile and index the documents
    logger.log('Compiling wotaku documentation...')

    const repos = [{
      owner: 'wotakumoe',
      repo: 'wotaku',
      path: 'docs'
    }]

    const documents = await compileToDocuments(repos)
    logger.log(`Compiled ${documents.length} document chunks`)

    // 4. Store documents in vector index
    logger.log('Storing documents in vector index...')
    await storeDocumentsInIndex(GUILD_ID, documents)

    // 5. Mark compilation as complete
    logger.log('Marking compilation as complete...')
    await prisma.queryEngineSettings.update({
      where: { guildId: BigInt(GUILD_ID) },
      data: {
        compiled: true,
        updatedAt: new Date()
      }
    })

    logger.log('🎉 Wotaku query engine seed completed successfully!')
    logger.log(`
📊 Summary:
- Guild ID: ${GUILD_ID}
- Forum Channel ID: ${FORUM_CHANNEL_ID}
- Repository: wotakumoe/wotaku (docs/ folder)
- Documents indexed: ${documents.length}
- System ready for anime/manga queries!
    `)
  } catch (error) {
    logger.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  seed()
}

export { seed }
