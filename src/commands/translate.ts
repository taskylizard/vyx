import { translate } from '@vitalets/google-translate-api';
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js';
import { Embed, defineSlashCommand } from '#framework';

export default defineSlashCommand({
  name: 'translate',
  description: 'Translate text using Google Translate API.',
  options: [
    {
      name: 'language',
      description:
        'The language code to translate to. https://cloud.google.com/translate/docs/languages',
      type: ApplicationCommandOptionTypes.STRING,
      required: true
    },
    {
      name: 'text',
      description: 'The text to translate.',
      type: ApplicationCommandOptionTypes.STRING,
      required: true
    }
  ],
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
    const language = ctx.options.getString('language', true);
    const _text = ctx.options.getString('text', true);
    const { text } = await translate(_text, { to: language });
    const embed = new Embed()
      .setTitle('Google Translate')
      .setColor(ctx.colors.BLUE)
      .addFields([
        { name: 'Original Text', value: _text },
        { name: 'Translated', value: text }
      ]);

    return await ctx.reply([embed]);
  }
});
