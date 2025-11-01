import { defineMessageCommand } from '#framework'
import {
  formatAskAIAnswer,
  generateFactCheck
} from '@packages/inference-engine'
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes,
  type Message
} from 'oceanic.js'
import { formatLongResponse } from '../framework/utils/response-utils'

export default defineMessageCommand({
  name: 'Fact-check message',
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  contexts: [
    InteractionContextTypes.GUILD,
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  async run(interaction) {
    const message = <Message> interaction.data.target

    // Don't fact-check empty messages or messages without meaningful content
    if (!message.content || message.content.trim().length < 10) {
      await interaction.reply({
        content:
          'Cannot fact-check this message - insufficient content to analyze.',
        flags: 64 // ephemeral
      })
      return
    }

    // Send initial response
    await interaction.reply({
      content: 'Analyzing message for factual accuracy...',
      flags: 64 // ephemeral
    })

    try {
      // Generate fact-check analysis using the inference engine
      const response = await generateFactCheck({
        messageContent: message.content,
        userId: interaction.user.id,
        username: interaction.user.username,
        guildId: interaction.guildID || undefined,
        guildName: interaction.guild?.name || undefined
      })

      if (response.data) {
        // Format the response using the shared formatter
        const formattedText = formatAskAIAnswer(response.data)
        const responseOptions = formatLongResponse(
          `**Fact-check results:**\n\n${
            formattedText || 'No results available.'
          }`
        )

        // Edit the initial response with the fact-check results
        await interaction.editOriginal(responseOptions)
      } else {
        await interaction.editOriginal({
          content: `Failed to analyze the message: ${
            response.error || 'Unknown error'
          }`
        })
      }
    } catch (error) {
      console.error('Fact-check error:', error)
      await interaction.editOriginal({
        content:
          'An error occurred while fact-checking. Please try again later.'
      })
    }
  }
})
