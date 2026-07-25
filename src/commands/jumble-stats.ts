import { slashSub } from '../bot/rosepack.ts'

export default slashSub({
  description: 'View your Jumble statistics',
  options: {
    kind: {
      description: 'Filter by Jumble type',
      kind: 'string',
      choices: [
        { name: 'All', value: 'all' },
        { name: 'Artist', value: 'artist' },
        { name: 'Album', value: 'album' },
        { name: 'Track / song', value: 'track' }
      ]
    }
  },
  async execute(context) {
    await context.defer({ ephemeral: true })
    const kind =
      context.options.kind === undefined || context.options.kind === 'all'
        ? undefined
        : context.options.kind
    const stats = await context.app.jumble.stats(context.interaction.user.id, kind)
    const winRate = stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100)
    const averageSeconds =
      stats.averageSeconds === null ? '—' : `${stats.averageSeconds.toFixed(1)}s`
    const averageHints = stats.averageHints === null ? '—' : stats.averageHints.toFixed(1)
    const averageReshuffles =
      stats.averageReshuffles === null ? '—' : stats.averageReshuffles.toFixed(1)
    await context.editResponse(
      [
        '**Jumble stats**',
        `Played: **${stats.played}** · Won: **${stats.won}** (${winRate}%)`,
        `Gave up: **${stats.gaveUp}** · Expired: **${stats.expired}**`,
        `Guesses: **${stats.correctGuesses}/${stats.guesses}**`,
        `Average solve time: **${averageSeconds}**`,
        `Average hints: **${averageHints}** · Reshuffles: **${averageReshuffles}**`
      ].join('\n')
    )
  }
})
