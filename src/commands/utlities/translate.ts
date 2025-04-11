import { translate } from '@vitalets/google-translate-api'
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { Embed, defineSlashCommand } from '#framework'

export default defineSlashCommand({
  name: 'translate',
  description: 'Translate text using Google Translate API.',
  options: {
    language: {
      description:
        'The language code to translate to. https://cloud.google.com/translate/docs/languages',
      type: 'string',
      required: true
    },
    text: {
      description: 'The text to translate.',
      type: 'string',
      required: true
    }
  },
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  async run(ctx) {
    const language = ctx.options.getString('language', true)
    const text = ctx.options.getString('text', true)
    const { text: translated } = await translate(text, { to: language })
    const embed = new Embed()
      .setTitle('Google Translate')
      .setColor(ctx.colors.BLUE)
      .addFields([
        { name: 'Original Text', value: text },
        { name: 'Translated', value: translated }
      ])

    return await ctx.reply([embed])
  }
})
