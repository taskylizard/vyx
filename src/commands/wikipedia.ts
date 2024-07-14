import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js';
import { match } from 'ts-pattern';
import { Embed, defineSlashCommand } from '#framework';

interface Response {
  type:
    | 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found'
    | 'no-extract';
  title: string;
  thumbnail?: { source?: string };
  description: string;
  extract: string;
  timestamp: string;
  content_urls: {
    mobile: {
      page: string;
      revisions: string;
    };
    desktop: {
      page: string;
      revisions: string;
    };
  };
}

export default defineSlashCommand({
  name: 'wikipedia',
  description: 'Search articles on the Wikipedia.',
  options: [
    {
      name: 'article',
      description: 'The article you want to search.',
      type: 'string',
      required: true
    }
  ] as const,
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
    const article = ctx.options.article;
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      article
    )}?redirect=true`;
    const notFoundType =
      'https://mediawiki.org/wiki/HyperSwitch/errors/not_found';
    const options = {
      headers: {
        'User-Agent': 'taskyyy/1.0 (User:taskyyy)'
      }
    };
    const rawData = await fetch(url, options);
    const data: Response = (await rawData.json()) as unknown as Response;

    return match(data)
      .with({ type: notFoundType }, async () => {
        const errorEmbed = new Embed()
          .setColor(ctx.colors.RED)
          .setTitle('Article not found')
          .setDescription(
            `${article} doesn't seem to be an article - did you spell the title correctly?`
          );
        return await ctx.reply([errorEmbed]);
      })
      .with({ type: 'no-extract' }, async (data) => {
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
              value:
                '*No extract available - feel free to take a look at the page using the links below*'
            },
            {
              name: 'Links',
              value: `[View article](${data.content_urls.desktop.page}) / [mobile view](${data.content_urls.mobile.page}) • [Revisions](${data.content_urls.desktop.revisions}) / [mobile view](${data.content_urls.mobile.revisions})`
            }
          ]);
        data.thumbnail?.source && embed.setImage(data.thumbnail.source);
        return await ctx.reply([embed]);
      })
      .otherwise(async (data) => {
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
              value: data.extract
            },
            {
              name: 'Links',
              value: `[View article](${data.content_urls.desktop.page}) / [mobile view](${data.content_urls.mobile.page}) • [Revisions](${data.content_urls.desktop.revisions}) / [mobile view](${data.content_urls.mobile.revisions})`
            }
          ]);
        data.thumbnail?.source && embed.setImage(data.thumbnail.source);
        return await ctx.reply([embed]);
      });
  }
});
