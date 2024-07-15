import { capitalize } from '@antfu/utils';
import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js';
import {
  Embed,
  defineSlashCommand,
  searchAnilist,
  truncateString
} from '#framework';

export default defineSlashCommand({
  name: 'anilist',
  description: 'AniList related commands.',
  contexts: [
    InteractionContextTypes.BOT_DM,
    InteractionContextTypes.GUILD,
    InteractionContextTypes.PRIVATE_CHANNEL
  ],
  integrationTypes: [
    ApplicationIntegrationTypes.USER_INSTALL,
    ApplicationIntegrationTypes.GUILD_INSTALL
  ],
  subcommands: [
    {
      name: 'anime',
      description: 'Searches by provided query on AniList.',
      options: {
        search: {
          type: 'string',
          description: 'Anime to search for.',
          required: true
        }
      },
      async run(ctx) {
        const query = ctx.options.search;

        // FIXME: fails here
        try {
          const anime = await searchAnilist(query, 'ANIME');

          if (!anime) {
            return await ctx.reply('No anime found.');
          }

          const native = anime.title?.native || 'Native not available';
          const english = anime.title?.english || 'English not available';
          const animeDescription =
            anime.description?.replace(/<\/?[^>]+(>|$)/g, '') ??
            '(No description)';
          const animeEpisodesRaw = `${anime.episodes} episodes | ${anime.duration} minute episodes`;
          const animeEpisodes = anime.episodes
            ? animeEpisodesRaw
            : 'No episodes available';
          const animeStartDate = [
            anime.startDate?.day || '??',
            anime.startDate?.month || '??',
            anime.startDate?.year || '????'
          ].join('.');
          const animeEndDate = [
            anime.endDate?.day || '??',
            anime.endDate?.month || '??',
            anime.endDate?.year || '????'
          ].join('.');
          const animeSeasonRaw = `${capitalize(anime.season ?? 'null')} ${anime.startDate?.year}`;
          const animeSeason = anime.season
            ? animeSeasonRaw
            : 'No season available';

          const embed = new Embed()
            .setTitle(`${native} • ${english}`)
            .setURL(anime.siteUrl || '')
            .setDescription(truncateString(animeDescription, 4095))
            .setColor(
              parseInt(anime.coverImage?.color?.replace('#', '') ?? '', 16)
            )
            .setThumbnail(anime.coverImage?.extraLarge ?? '')
            .addFields([
              {
                name: 'Genres',
                value: anime.genres?.join(', ') ?? 'None',
                inline: true
              },
              {
                name: 'Avg. Score',
                value: anime.averageScore?.toString() || 'No score available',
                inline: true
              },
              {
                name: 'Mean Score',
                value: anime.meanScore?.toString() || 'No score available',
                inline: true
              },
              {
                name: 'Episodes',
                value: animeEpisodes || 'No episodes available',
                inline: true
              },
              { name: 'Season', value: animeSeason, inline: true },
              { name: 'Started', value: animeStartDate, inline: true },
              { name: 'Ended', value: animeEndDate, inline: true }
            ])
            .setFooter({ text: `ID: ${anime.id}` });

          return await ctx.reply([embed]);
        } catch (error) {
          ctx.client.logger.error('Anilist:', ctx.options.raw, error);
          return await ctx.reply(
            "This errored and I have no idea why, but I've logged it."
          );
        }
      }
    },
    {
      name: 'manga',
      description: 'Searches by provided query on AniList.',
      options: [
        {
          type: 3,
          name: 'search',
          description: 'Manga to search for.',
          required: true
        }
      ],
      async run(ctx) {
        const query = ctx.options.getString('search', true);
        try {
          const manga = await searchAnilist(query, 'MANGA');

          if (!manga) {
            return await ctx.reply('No manga found.');
          }

          const native = manga.title?.native || 'Native not available';
          const english = manga.title?.english || 'English not available';
          const description =
            manga.description?.replace(/<\/?[^>]+(>|$)/g, '') ??
            '(No description)';
          const volumes = manga.volumes
            ? `${manga.volumes} Episodes | ${manga.chapters} Chapters`
            : 'No volumes available';
          const started = [
            manga.startDate?.day || '??',
            manga.startDate?.month || '??',
            manga.startDate?.year || '????'
          ].join('.');
          const ended = [
            manga.endDate?.day || '??',
            manga.endDate?.month || '??',
            manga.endDate?.year || '????'
          ].join('.');
          const seasonRaw = `${capitalize(manga.season ?? 'null')} ${manga.startDate?.year}`;
          const season = manga.season ? seasonRaw : 'No season available';

          const embed = new Embed()
            .setTitle(`${native} • ${english}`)
            .setURL(manga.siteUrl || '')
            .setDescription(truncateString(description, 4095))
            .setColor(
              parseInt(manga.coverImage?.color?.replace('#', '') ?? '', 16)
            )
            .setThumbnail(manga.coverImage?.extraLarge ?? '')
            .addFields([
              {
                name: 'Genres',
                value: manga.genres?.join(', ') ?? 'None',
                inline: true
              },
              {
                name: 'Avg. Score',
                value: manga.averageScore?.toString() || 'No score available',
                inline: true
              },
              {
                name: 'Mean Score',
                value: manga.meanScore?.toString() || 'No score available',
                inline: true
              },
              {
                name: 'Volumes',
                value: volumes,
                inline: true
              },
              { name: 'Season', value: season, inline: true },
              { name: 'Started', value: started, inline: true },
              { name: 'Ended', value: ended, inline: true }
            ])
            .setFooter({ text: `ID: ${manga.id}` });

          return await ctx.reply([embed]);
        } catch (error) {
          ctx.client.logger.error('Anilist:', ctx.options.raw, error);
          return await ctx.reply(
            "This errored and I have no idea why, but I've logged it."
          );
        }
      }
    }
  ]
});
