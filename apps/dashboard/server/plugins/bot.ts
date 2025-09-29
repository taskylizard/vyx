import { Client } from '@apps/bot'
import { logger } from '../utils/utils'

let botInstance: Client | null = null
export const getBotInstance = () => botInstance

export default defineNitroPlugin(async (nitroApp) => {
  logger.log('Initializing bot client for dashboard...')

  try {
    botInstance = new Client()

    await botInstance.start()

    nitroApp.hooks.hook('request', async (event) => {
      event.context.bot = botInstance!
    })

    nitroApp.hooks.hook('close', async () => {
      if (botInstance) {
        logger.log('Shutting down bot client...')
        await botInstance.prisma.$disconnect()
        if (botInstance.modules.analytics) {
          await botInstance.modules.analytics.close()
        }
        botInstance.disconnect()
        botInstance = null
      }
    })
  } catch (error) {
    logger.error('Failed to initialize bot client:', error)
  }
})
