import {
  type Client,
  defineSlashCommand,
  Embed,
  error,
  ok,
  type Result
} from '#framework'
import {
  ApplicationCommandOptionTypes,
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js'
import { match } from 'ts-pattern'

interface Response {
  type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' | 'no-extract'
  title: string
  thumbnail?: { source?: string }
  description: string
  extract: string
  timestamp: string
  content_urls: {
    mobile: { page: string; revisions: string }
    desktop: { page: string; revisions: string }
  }
}

async function fetchWikipediaSummary(
  client: Client,
  article: string
): Promise<Result<Response>> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${
    encodeURIComponent(article)
  }?redirect=true`
  try {
    const res = await client.fetcher<Response>(url)
    return ok(res)
  } catch {
    return error('Failed to fetch Wikipedia summary, this page may not exist.')
  }
}

function createWikipediaEmbed(data: Response): Embed {
  const embed = new Embed()
    .setTitle(`${data.title} on Wikipedia`)
    .setFooter({
      text: `Last Updated: ${new Date(data.timestamp).toDateString()}`
    })
    .setDescription(
      `*${data.description ?? 'This article has no short description.'}*`
    )
    .addFields([
      {
        name: 'Extract',
        value: data.type === 'no-extract'
          ? '*No extract available - feel free to take a look at the page using the links below*'
          : data.extract
      },
      {
        name: 'Links',
        value:
          `[View article](${data.content_urls.desktop.page}) / [mobile view](${data.content_urls.mobile.page}) • [Revisions](${data.content_urls.desktop.revisions}) / [mobile view](${data.content_urls.mobile.revisions})`
      }
    ])

  if (data.thumbnail?.source) embed.setImage(data.thumbnail.source)
  return embed
}

export default defineSlashCommand({
  name: 'wikipedia',
  description: 'Search articles on the Wikipedia.',
  options: [
    {
      name: 'article',
      description: 'The article you want to search.',
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
    const result = await fetchWikipediaSummary(
      ctx.client,
      ctx.options.getString('article', true)
    )

    if (!result.ok) {
      return await ctx.reply([
        new Embed()
          .setColor(ctx.colors.RED)
          .setTitle('Error')
          .setDescription(result.error)
      ])
    }

    const data = result.value
    const notFoundType =
      'https://mediawiki.org/wiki/HyperSwitch/errors/not_found'

    return match(data)
      .with({ type: notFoundType }, async () => {
        return await ctx.reply([
          new Embed()
            .setColor(ctx.colors.RED)
            .setTitle('Article not found')
            .setDescription(
              `${data.title} doesn't seem to be an article - did you spell the title correctly?`
            )
        ])
      })
      .otherwise(async () => {
        return await ctx.reply([createWikipediaEmbed(data)])
      })
  }
})
