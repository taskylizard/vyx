import { safeInline } from './presentation.ts'
import type { JumbleProfileSummary, JumbleStats } from './types.ts'

const PROFILE_KINDS = ['all', 'artist', 'album', 'track'] as const
type ProfileKind = (typeof PROFILE_KINDS)[number]

const PROFILE_KIND_LABELS = {
  all: 'All',
  artist: 'Artists',
  album: 'Albums',
  track: 'Tracks'
} satisfies Record<ProfileKind, string>

export function buildJumbleProfileMessage(
  summary: JumbleProfileSummary,
  savedUsername?: string
): string {
  const username = summary.username === null ? '**not set**' : `\`${safeInline(summary.username)}\``
  const lines = [
    '**Jumble profile**',
    `Last.fm: ${username}`,
    '',
    '**Tracked by Jumble**',
    `All: **${formatCount(summary.tracked.all)}**`,
    `Artists: **${formatCount(summary.tracked.artist)}** · Albums: **${formatCount(summary.tracked.album)}** · Tracks: **${formatCount(summary.tracked.track)}**`,
    '',
    '**Jumble stats**',
    ...PROFILE_KINDS.flatMap((kind) => formatStats(kind, summary.stats[kind]))
  ]

  if (savedUsername !== undefined) {
    lines.unshift(`✅ Saved Last.fm profile \`${safeInline(savedUsername)}\`.`, '')
  }

  if (summary.username === null) {
    lines.push('', '-# Set one with `/jumble profile username:<name>`.')
  } else {
    lines.push('', '-# Tracked counts are the local Jumble index and refresh in the background.')
  }

  return lines.join('\n')
}

function formatStats(kind: ProfileKind, stats: JumbleStats): readonly string[] {
  const winRate = stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100)
  return [
    `${PROFILE_KIND_LABELS[kind]} — Played **${stats.played}** · Won **${stats.won}** (${winRate}%) · Gave up **${stats.gaveUp}** · Expired **${stats.expired}**`,
    `-# ${PROFILE_KIND_LABELS[kind]} details: **${stats.correctGuesses}/${stats.guesses}** guesses · Avg solve **${formatAverage(stats.averageSeconds, 's')}** · Avg hints **${formatAverage(stats.averageHints)}** · Reshuffles **${formatAverage(stats.averageReshuffles)}**`
  ]
}

function formatAverage(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}
