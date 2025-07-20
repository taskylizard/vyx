import {
  ApplicationIntegrationTypes,
  InteractionContextTypes,
  MessageFlags
} from 'oceanic.js'
import { defineSlashCommand, Embed } from '#framework'

export default defineSlashCommand({
  name: 'search',
  description: 'Search the web using Searxng.',
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  options: {
    query: {
      type: 'string',
      description: 'The query to search for.',
      required: true
    },
    ephemeral: {
      type: 'boolean',
      description: 'Whether the response should be ephemeral.',
      required: false
    },
    limit: {
      type: 'integer',
      description: 'The maximum number of results to return.',
      required: false
    }
  },
  async run(ctx) {
    const query = ctx.options.getString('query', true)
    const ephemeral = ctx.options.getBoolean('ephemeral', false)
    const limit = ctx.options.getInteger('limit', false) || 3

    if (limit > 8)
      return await ctx.reply('The limit must be less than 8, sorry.')

    if (ephemeral) {
      await ctx.interaction.defer(MessageFlags.EPHEMERAL)
    }

    const searchResults = await ctx.client.modules.ai.search(query, {})

    if (!searchResults.results || searchResults.results.length === 0) {
      return await ctx.interaction.editOriginal({
        embeds: [new Embed().setDescription('No results found.')]
      })
    }

    const embed = new Embed()
      .setTitle(`Search results for "${query}"`)
      .setDescription(
        searchResults.results
          .slice(0, limit)
          .map(
            (result) => `[${result.title}](${result.url}) - ${result.content}`
          )
          .join('\n')
      )

    return await ctx.interaction.editOriginal({
      embeds: [embed]
    })
  }
})
