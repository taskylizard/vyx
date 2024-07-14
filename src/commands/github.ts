import {
  ApplicationIntegrationTypes,
  InteractionContextTypes
} from 'oceanic.js';
import { Embed, defineSlashCommand } from '#framework';

interface Response {
  name: string;
  full_name: string;
  description: string | null;
  topics: string[];
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  html_url: string;
  homepage: string;
}

interface Commit {
  sha: string;
  html_url: string;
}

export default defineSlashCommand({
  name: 'github',
  description:
    'Get info on a Github repository. The repository must be public.',
  options: [
    {
      name: 'repo',
      description:
        'The repository as owner/repo or its link. It must be public.',
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
    const regex = /http(s)?:\/\/github.com\//;
    const input = ctx.options.repo.replace(regex, '');

    // urls
    const url = `https://api.github.com/repos/${input}`;
    const commitsUrl = `https://api.github.com/repos/${input}/commits`;

    // fetch repo
    const rawData = await fetch(url);
    const repo: Response = (await rawData.json()) as unknown as Response;
    if (repo) {
      if (!repo.name)
        return ctx.reply(
          'That repository could be found - did you spell its name correctly, and is it private?'
        );
    }
    const rawCommitData = await fetch(commitsUrl);
    const commits: Commit[] =
      (await rawCommitData.json()) as unknown as Commit[];

    const embed = new Embed()
      .setTitle(`${repo.full_name} on GitHub`)
      .setDescription(
        repo.description !== null
          ? `${repo.description}`
          : 'This repository has no description.'
      )
      .addField(
        'Topics',
        repo.topics[0]
          ? `\`${repo.topics.join('`, `')}\``
          : 'This repository has no topics.'
      )
      .addField(
        'Latest Commit',
        commits[0]
          ? `\`${commits[0].sha.slice(0, 7)}\`([link](${commits[0].html_url}))`
          : 'This repository has no commits.'
      )
      .addField(
        'Stars',
        `${repo.stargazers_count} ${
          repo.stargazers_count === 1 ? 'star' : 'stars'
        }`
      )
      .addField(
        'Watchers',
        `${repo.watchers_count} ${
          repo.watchers_count === 1 ? 'watcher' : 'watchers'
        }`
      )
      .addField(
        'Forks',
        `${repo.forks_count} ${repo.forks_count === 1 ? 'fork' : 'forks'}`
      )
      .addField(
        'Links',
        `[View on GitHub](${repo.html_url}) • [Issues](${
          repo.html_url
        }/issues) • [Pull requests](${repo.html_url}/pulls) ${
          repo.homepage ? ` • [Homepage](${repo.homepage})` : ''
        }`
      );

    return ctx.reply([embed]);
  }
});
