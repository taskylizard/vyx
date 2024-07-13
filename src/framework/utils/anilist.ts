import { type Media, type MediaType, anilist } from 'anilist';

export const FullMediaQuery = anilist.query
  .media()
  .withSiteUrl()
  .withTitles('english', 'native')
  .withDescription()
  .withGenres()
  .withStartDate()
  .withEndDate()
  .withEpisodes()
  .withDuration()
  .withAverageScore()
  .withRankings('rank', 'allTime')
  .withCoverImage('color', 'extraLarge')
  .withMeanScore()
  .withId()
  .withSeason()
  .withChapters()
  .withVolumes();

export const MediaQuery = anilist.query.media().withTitles().withId();
export const PageQuery = anilist.query
  .page({ perPage: 15 })
  .withMedia(MediaQuery);

const localAnilistCache = new Map<string, Media>();

export async function searchAnilist(
  search: string,
  type: MediaType
): Promise<Media> {
  const cached = localAnilistCache.get(search);
  if (typeof cached !== 'undefined') return cached;

  FullMediaQuery.arguments({
    search: search,
    type: type
  });

  const data = await FullMediaQuery.fetch();
  localAnilistCache.set(search, <never>data);

  return data;
}
